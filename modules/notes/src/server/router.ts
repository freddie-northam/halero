// The notes module's tRPC router: CRUD over user-owned note entities.
// A note's title, searchable snippet, and timestamps live on the entity
// spine; its BlockNote block document and tags live in the notes
// satellite. Every spine write goes through the host's user-entity store
// so its source and tombstone rules hold. The snippet is the document's
// extracted plain text, recomputed on every body change so full-text
// search stays in sync.

import { entities, notes } from "@halero/db";
import type { ModuleDb } from "@halero/module-sdk/server";
import { NOTE_ITEM_KIND } from "@halero/schemas";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Note, NoteDocument, NoteList, NoteListItem } from "../contract";
import { notePlaintext } from "./note-plaintext";
import { moduleRouter, protectedProcedure } from "./trpc";

/** The note.item satellite schema version this build stores. */
export const NOTE_ITEM_SCHEMA_VERSION = 1;

const TITLE_MAX_LENGTH = 200;
const TAG_MAX_LENGTH = 40;
const TAGS_MAX_COUNT = 12;
/** Serialized document byte ceiling; bounds the snippet walk and the row. */
const DOCUMENT_MAX_BYTES = 1_000_000;

/** A fresh note's body: one empty paragraph, what BlockNote opens with. */
const DEFAULT_DOCUMENT: NoteDocument = [{ type: "paragraph" }];

const badRequest = (message: string): TRPCError =>
  new TRPCError({ code: "BAD_REQUEST", message });

// Shape only; the handlers validate values themselves so rejections carry
// readable messages instead of zod issue dumps. The document is an opaque
// block array: only its array-ness is checked here.
const documentInput = z.array(z.unknown());

const createInput = z.object({
  title: z.string(),
  document: documentInput.optional(),
});

const updateInput = z.object({
  entityId: z.string(),
  title: z.string().optional(),
  document: documentInput.optional(),
  // No null variant: an empty array clears, mirroring the [] the read
  // side returns for an untagged note.
  tags: z.array(z.string()).optional(),
});

const entityIdInput = z.object({ entityId: z.string() });

const validatedTitle = (raw: string): string => {
  const title = raw.trim();
  if (title.length === 0) {
    throw badRequest("A note needs a title.");
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw badRequest(
      `Note titles are limited to ${TITLE_MAX_LENGTH} characters.`,
    );
  }
  return title;
};

/** Trims, rejects blanks and oversizes readably, and deduplicates. */
const validatedTags = (raw: readonly string[]): readonly string[] => {
  const tags: string[] = [];
  for (const rawTag of raw) {
    const tag = rawTag.trim();
    if (tag.length === 0) {
      throw badRequest("Tags cannot be empty.");
    }
    if (tag.length > TAG_MAX_LENGTH) {
      throw badRequest(`Tags are limited to ${TAG_MAX_LENGTH} characters.`);
    }
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  if (tags.length > TAGS_MAX_COUNT) {
    throw badRequest(`A note can have at most ${TAGS_MAX_COUNT} tags.`);
  }
  return tags;
};

/**
 * Serializes the block document and rejects an oversized one readably.
 * The cap is on UTF-8 bytes, since that is what the SQLite row and the
 * snippet walk actually cost.
 */
const validatedDocumentJson = (document: NoteDocument): string => {
  const json = JSON.stringify(document);
  if (new TextEncoder().encode(json).length > DOCUMENT_MAX_BYTES) {
    throw badRequest("This note is too large to save.");
  }
  return json;
};

/** null for no tags so the column reads NULL, not "[]". */
const tagsColumnValue = (tags: readonly string[]): string | null =>
  tags.length === 0 ? null : JSON.stringify(tags);

const parseTags = (raw: string | null): readonly string[] => {
  if (raw === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.filter((tag): tag is string => typeof tag === "string")
    : [];
};

const parseDocument = (raw: string): NoteDocument => {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const noteColumns = {
  entityId: entities.id,
  title: entities.title,
  document: notes.document,
  tags: notes.tags,
  createdAt: entities.createdAt,
  updatedAt: entities.updatedAt,
};

interface NoteRow {
  readonly entityId: string;
  readonly title: string | null;
  readonly document: string;
  readonly tags: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const toNote = (row: NoteRow): Note => ({
  entityId: row.entityId,
  title: row.title ?? "",
  document: parseDocument(row.document),
  tags: parseTags(row.tags),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const noteListColumns = {
  entityId: entities.id,
  title: entities.title,
  snippet: entities.snippet,
  tags: notes.tags,
  updatedAt: entities.updatedAt,
};

interface NoteListRow {
  readonly entityId: string;
  readonly title: string | null;
  readonly snippet: string | null;
  readonly tags: string | null;
  readonly updatedAt: number;
}

const toNoteListItem = (row: NoteListRow): NoteListItem => ({
  entityId: row.entityId,
  title: row.title ?? "",
  preview: row.snippet ?? "",
  tags: parseTags(row.tags),
  updatedAt: row.updatedAt,
});

/** Reads one note back after a write; the row is known to exist. */
const readNote = (db: ModuleDb, entityId: string): Note => {
  const row = db
    .select(noteColumns)
    .from(entities)
    .innerJoin(notes, eq(notes.entityId, entities.id))
    .where(eq(entities.id, entityId))
    .get();
  if (row === undefined) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "This note could not be read back after saving.",
    });
  }
  return toNote(row);
};

const noteGuardColumns = {
  deletedAt: entities.deletedAt,
  source: entities.source,
};

/**
 * get, update, and delete only accept entities that ARE notes, and the
 * router rejects connector-owned and tombstoned ones up front with
 * semantic statuses (403/404) instead of letting the store's plain
 * Errors surface as 500s. The store's own guards stay as the defensive
 * backstop. The satellite row survives a soft delete, so delete opts into
 * tombstones (allowTombstoned) to keep its idempotent no-op.
 */
const requireNoteSatellite = (
  db: ModuleDb,
  entityId: string,
  options: { readonly allowTombstoned?: boolean } = {},
) => {
  const row = db
    .select(noteGuardColumns)
    .from(notes)
    .innerJoin(entities, eq(entities.id, notes.entityId))
    .where(eq(notes.entityId, entityId))
    .get();
  if (row === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This item is not a note.",
    });
  }
  if (row.source === "connector") {
    throw new TRPCError({
      code: "FORBIDDEN",
      // The entity store's own message; the store remains the backstop.
      message: "This item is managed by a connector sync and cannot be edited.",
    });
  }
  if (row.deletedAt !== null && options.allowTombstoned !== true) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This note was deleted.",
    });
  }
  return row;
};

/** Live notes, most recently updated first, then newest created. */
const liveNotes = (db: ModuleDb): readonly NoteListItem[] =>
  db
    .select(noteListColumns)
    .from(entities)
    .innerJoin(notes, eq(notes.entityId, entities.id))
    .where(and(eq(entities.kind, NOTE_ITEM_KIND), isNull(entities.deletedAt)))
    .orderBy(desc(entities.updatedAt), desc(entities.createdAt))
    .all()
    .map(toNoteListItem);

export const notesRouter = moduleRouter({
  list: protectedProcedure.query(({ ctx }) => {
    const list: NoteList = { notes: liveNotes(ctx.db) };
    return list;
  }),

  get: protectedProcedure.input(entityIdInput).query(({ ctx, input }) => {
    requireNoteSatellite(ctx.db, input.entityId);
    return readNote(ctx.db, input.entityId);
  }),

  create: protectedProcedure.input(createInput).mutation(({ ctx, input }) => {
    const title = validatedTitle(input.title);
    const document = input.document ?? DEFAULT_DOCUMENT;
    const documentJson = validatedDocumentJson(document);
    const snippet = notePlaintext(document);
    return ctx.entities.withTransaction(() => {
      const { entityId } = ctx.entities.createUserEntity({
        kind: NOTE_ITEM_KIND,
        schemaVersion: NOTE_ITEM_SCHEMA_VERSION,
        title,
        ...(snippet === "" ? {} : { snippet }),
      });
      ctx.db
        .insert(notes)
        .values({ entityId, document: documentJson, tags: null })
        .run();
      return readNote(ctx.db, entityId);
    });
  }),

  update: protectedProcedure.input(updateInput).mutation(({ ctx, input }) => {
    const title =
      input.title === undefined ? undefined : validatedTitle(input.title);
    const documentJson =
      input.document === undefined
        ? undefined
        : validatedDocumentJson(input.document);
    const tags =
      input.tags === undefined ? undefined : validatedTags(input.tags);
    requireNoteSatellite(ctx.db, input.entityId);
    return ctx.entities.withTransaction(() => {
      // Always runs, even for a satellite-only patch: it bumps updated_at
      // and enforces the store's tombstone/source guards. The snippet is
      // recomputed only when the body changes.
      ctx.entities.updateUserEntity(input.entityId, {
        ...(title === undefined ? {} : { title }),
        ...(input.document === undefined
          ? {}
          : { snippet: notePlaintext(input.document) }),
      });
      const changes = {
        ...(documentJson === undefined ? {} : { document: documentJson }),
        ...(tags === undefined ? {} : { tags: tagsColumnValue(tags) }),
      };
      if (Object.keys(changes).length > 0) {
        ctx.db
          .update(notes)
          .set(changes)
          .where(eq(notes.entityId, input.entityId))
          .run();
      }
      return readNote(ctx.db, input.entityId);
    });
  }),

  // Idempotent: the satellite row survives the soft delete, so a repeat
  // call passes the note guard (tombstones allowed here, unlike get and
  // update) and the store treats it as a no-op.
  delete: protectedProcedure.input(entityIdInput).mutation(({ ctx, input }) => {
    requireNoteSatellite(ctx.db, input.entityId, { allowTombstoned: true });
    ctx.entities.deleteUserEntity(input.entityId);
    return { entityId: input.entityId };
  }),
});
