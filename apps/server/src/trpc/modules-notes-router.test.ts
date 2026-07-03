import { describe, expect, test } from "bun:test";
import { createEntityStore, searchEntities } from "@halero/core";
import { entities, notes } from "@halero/db";
import { eq } from "drizzle-orm";
import {
  completeSetup,
  makeTestApp,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

interface NoteData {
  readonly entityId: string;
  readonly title: string;
  readonly document: readonly unknown[];
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface NoteListItemData {
  readonly entityId: string;
  readonly title: string;
  readonly preview: string;
  readonly tags: readonly string[];
  readonly updatedAt: number;
}

interface NoteListData {
  readonly notes: readonly NoteListItemData[];
}

interface TrpcErrorBody {
  readonly error: { readonly message: string };
}

/** A paragraph carrying one text run, the minimal non-empty body. */
const paragraph = (text: string): readonly unknown[] => [
  { type: "paragraph", content: [{ type: "text", text }] },
];

const createNote = async (
  app: TestApp["app"],
  cookie: string,
  input: { readonly title: string; readonly document?: readonly unknown[] },
): Promise<NoteData> => {
  const res = await trpcMutation(app, "modules.notes.create", input, {
    cookie,
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<NoteData>;
  return json.result.data;
};

const getNote = async (
  app: TestApp["app"],
  cookie: string,
  entityId: string,
): Promise<NoteData> => {
  const res = await trpcQuery(
    app,
    `modules.notes.get?input=${encodeURIComponent(JSON.stringify({ entityId }))}`,
    { cookie },
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<NoteData>;
  return json.result.data;
};

const listNotes = async (
  app: TestApp["app"],
  cookie: string,
): Promise<NoteListData> => {
  const res = await trpcQuery(app, "modules.notes.list", { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<NoteListData>;
  return json.result.data;
};

const updateNote = async (
  app: TestApp["app"],
  cookie: string,
  input: {
    readonly entityId: string;
    readonly title?: string;
    readonly document?: readonly unknown[];
    readonly tags?: readonly string[];
  },
): Promise<NoteData> => {
  const res = await trpcMutation(app, "modules.notes.update", input, {
    cookie,
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<NoteData>;
  return json.result.data;
};

const deleteNote = async (
  app: TestApp["app"],
  cookie: string,
  entityId: string,
): Promise<void> => {
  const res = await trpcMutation(
    app,
    "modules.notes.delete",
    { entityId },
    { cookie },
  );
  expect(res.status).toBe(200);
};

const mutationError = async (
  app: TestApp["app"],
  cookie: string,
  procedure: string,
  input: unknown,
  status: number,
): Promise<string> => {
  const res = await trpcMutation(app, procedure, input, { cookie });
  expect(res.status).toBe(status);
  const json = (await res.json()) as TrpcErrorBody;
  return json.error.message;
};

const readEntityRow = (testApp: TestApp, entityId: string) =>
  testApp.database.db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .get();

const readSatelliteRow = (testApp: TestApp, entityId: string) =>
  testApp.database.db
    .select()
    .from(notes)
    .where(eq(notes.entityId, entityId))
    .get();

/** A live connector-owned note row: the store must refuse to touch it. */
const seedConnectorNote = (testApp: TestApp, id: string): void => {
  testApp.database.db
    .insert(entities)
    .values({
      id,
      kind: "note.item",
      schemaVersion: 1,
      title: "Synced note",
      snippet: null,
      occurredStart: null,
      occurredEnd: null,
      source: "connector",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    })
    .run();
  testApp.database.db
    .insert(notes)
    .values({ entityId: id, document: "[]", tags: null })
    .run();
};

const NOT_A_NOTE_MESSAGE = "This item is not a note.";
const NOTE_DELETED_MESSAGE = "This note was deleted.";
const CONNECTOR_MANAGED_MESSAGE =
  "This item is managed by a connector sync and cannot be edited.";

describe("modules.notes auth", () => {
  test("every procedure rejects without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const queries = [
      "modules.notes.list",
      `modules.notes.get?input=${encodeURIComponent(JSON.stringify({ entityId: "n1" }))}`,
    ];
    for (const procedure of queries) {
      const res = await trpcQuery(app, procedure);
      expect(res.status).toBe(401);
    }
    const mutations: readonly (readonly [string, unknown])[] = [
      ["modules.notes.create", { title: "Sneak in" }],
      ["modules.notes.update", { entityId: "n1", title: "Sneak in" }],
      ["modules.notes.delete", { entityId: "n1" }],
    ];
    for (const [procedure, input] of mutations) {
      const res = await trpcMutation(app, procedure, input);
      expect(res.status).toBe(401);
    }
  });
});

describe("modules.notes.create", () => {
  test("returns the created note and shows it in the list", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const note = await createNote(testApp.app, cookie, {
      title: "  Trip plan  ",
      document: paragraph("Book flights and a hotel"),
    });

    expect(note.title).toBe("Trip plan");
    expect(note.document).toEqual(paragraph("Book flights and a hotel"));
    expect(note.tags).toEqual([]);
    const entity = readEntityRow(testApp, note.entityId);
    expect(entity?.kind).toBe("note.item");
    expect(entity?.source).toBe("user");
    const list = await listNotes(testApp.app, cookie);
    expect(list.notes.map((item) => item.entityId)).toEqual([note.entityId]);
    expect(list.notes[0]?.preview).toBe("Book flights and a hotel");
  });

  test("defaults to a single empty paragraph when no document is given", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const note = await createNote(testApp.app, cookie, { title: "Empty" });

    expect(note.document).toEqual([{ type: "paragraph" }]);
    // An empty body means an empty snippet, so nothing to search on yet.
    expect(readEntityRow(testApp, note.entityId)?.snippet).toBeNull();
  });

  test("makes the note body full-text searchable via the snippet", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const note = await createNote(testApp.app, cookie, {
      title: "Untitled thought",
      document: paragraph("quarterly revenue projections"),
    });

    const hits = searchEntities(testApp.database.sqlite, {
      query: "quarterly",
    });
    expect(hits.map((hit) => hit.entityId)).toContain(note.entityId);
  });

  test("rejects an empty title readably", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.notes.create",
      { title: "   " },
      400,
    );

    expect(message).toBe("A note needs a title.");
  });

  test("rejects a note whose serialized document exceeds the size cap", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const huge = paragraph("x".repeat(1_000_001));
    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.notes.create",
      { title: "Too big", document: huge },
      400,
    );

    expect(message).toBe("This note is too large to save.");
  });
});

describe("modules.notes.get", () => {
  test("returns the full document for a live note", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const created = await createNote(testApp.app, cookie, {
      title: "Read me",
      document: paragraph("the whole body"),
    });

    const fetched = await getNote(testApp.app, cookie, created.entityId);

    expect(fetched.entityId).toBe(created.entityId);
    expect(fetched.document).toEqual(paragraph("the whole body"));
  });

  test("rejects a non-note entity as not found", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const store = createEntityStore(testApp.database);
    const { entityId } = store.createUserEntity({
      kind: "task.item",
      schemaVersion: 1,
      title: "A task, not a note",
    });

    const res = await trpcQuery(
      testApp.app,
      `modules.notes.get?input=${encodeURIComponent(JSON.stringify({ entityId }))}`,
      { cookie },
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as TrpcErrorBody;
    expect(json.error.message).toBe(NOT_A_NOTE_MESSAGE);
  });
});

describe("modules.notes.update", () => {
  test("a title change preserves the document", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const note = await createNote(testApp.app, cookie, {
      title: "Old title",
      document: paragraph("unchanged body"),
    });

    const updated = await updateNote(testApp.app, cookie, {
      entityId: note.entityId,
      title: "New title",
    });

    expect(updated.title).toBe("New title");
    expect(updated.document).toEqual(paragraph("unchanged body"));
    expect(readEntityRow(testApp, note.entityId)?.title).toBe("New title");
  });

  test("a body change recomputes the search snippet", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const note = await createNote(testApp.app, cookie, {
      title: "Retitle body",
      document: paragraph("mango orchard"),
    });

    await updateNote(testApp.app, cookie, {
      entityId: note.entityId,
      document: paragraph("cedar workshop"),
    });

    expect(
      searchEntities(testApp.database.sqlite, { query: "mango" }).map(
        (hit) => hit.entityId,
      ),
    ).not.toContain(note.entityId);
    expect(
      searchEntities(testApp.database.sqlite, { query: "cedar" }).map(
        (hit) => hit.entityId,
      ),
    ).toContain(note.entityId);
  });

  test("sets and clears tags", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const note = await createNote(testApp.app, cookie, { title: "Tag me" });

    const tagged = await updateNote(testApp.app, cookie, {
      entityId: note.entityId,
      tags: ["travel", " travel ", "2026"],
    });
    expect(tagged.tags).toEqual(["travel", "2026"]);
    expect(readSatelliteRow(testApp, note.entityId)?.tags).toBe(
      JSON.stringify(["travel", "2026"]),
    );

    const cleared = await updateNote(testApp.app, cookie, {
      entityId: note.entityId,
      tags: [],
    });
    expect(cleared.tags).toEqual([]);
    expect(readSatelliteRow(testApp, note.entityId)?.tags).toBeNull();
  });

  test("bumps the spine updated_at", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const note = await createNote(testApp.app, cookie, { title: "Touch" });
    testApp.database.sqlite.run(
      "UPDATE entities SET updated_at = 111 WHERE id = ?",
      [note.entityId],
    );

    await updateNote(testApp.app, cookie, {
      entityId: note.entityId,
      title: "Touched",
    });

    expect(readEntityRow(testApp, note.entityId)?.updatedAt).toBeGreaterThan(
      111,
    );
  });

  test("rejects an update on a tombstoned note as not found", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const note = await createNote(testApp.app, cookie, { title: "Gone" });
    await deleteNote(testApp.app, cookie, note.entityId);

    const message = await mutationError(
      testApp.app,
      cookie,
      "modules.notes.update",
      { entityId: note.entityId, title: "Necromancy" },
      404,
    );

    expect(message).toBe(NOTE_DELETED_MESSAGE);
  });
});

describe("modules.notes.delete", () => {
  test("soft-deletes: the spine survives, list and search exclude it", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const note = await createNote(testApp.app, cookie, {
      title: "Zanzibar expedition",
      document: paragraph("Zanzibar itinerary"),
    });
    expect(
      searchEntities(testApp.database.sqlite, { query: "Zanzibar" }).map(
        (hit) => hit.entityId,
      ),
    ).toContain(note.entityId);

    await deleteNote(testApp.app, cookie, note.entityId);

    const entity = readEntityRow(testApp, note.entityId);
    expect(entity).toBeDefined();
    expect(entity?.deletedAt).not.toBeNull();
    // The satellite row survives the tombstone.
    expect(readSatelliteRow(testApp, note.entityId)).toBeDefined();
    expect((await listNotes(testApp.app, cookie)).notes).toHaveLength(0);
    expect(
      searchEntities(testApp.database.sqlite, { query: "Zanzibar" }),
    ).toHaveLength(0);
  });

  test("a repeat delete is an idempotent no-op", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const note = await createNote(testApp.app, cookie, { title: "Twice" });
    await deleteNote(testApp.app, cookie, note.entityId);
    const deletedAt = readEntityRow(testApp, note.entityId)?.deletedAt;
    expect(deletedAt).not.toBeNull();

    await deleteNote(testApp.app, cookie, note.entityId);

    expect(readEntityRow(testApp, note.entityId)?.deletedAt).toBe(
      deletedAt ?? Number.NaN,
    );
  });
});

describe("the note guard", () => {
  test("rejects a non-note entity readably on update and delete", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    const store = createEntityStore(testApp.database);
    const { entityId } = store.createUserEntity({
      kind: "task.item",
      schemaVersion: 1,
      title: "A task, not a note",
    });

    const attempts: readonly (readonly [string, unknown])[] = [
      ["modules.notes.update", { entityId, title: "Hijack" }],
      ["modules.notes.delete", { entityId }],
    ];
    for (const [procedure, input] of attempts) {
      const message = await mutationError(
        testApp.app,
        cookie,
        procedure,
        input,
        404,
      );
      expect(message).toBe(NOT_A_NOTE_MESSAGE);
    }
  });

  test("rejects a connector-managed note as forbidden with the store's message", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedConnectorNote(testApp, "synced-note-1");

    const attempts: readonly (readonly [string, unknown])[] = [
      ["modules.notes.update", { entityId: "synced-note-1", title: "Mine" }],
      ["modules.notes.delete", { entityId: "synced-note-1" }],
    ];
    for (const [procedure, input] of attempts) {
      const message = await mutationError(
        testApp.app,
        cookie,
        procedure,
        input,
        403,
      );
      expect(message).toBe(CONNECTOR_MANAGED_MESSAGE);
    }
  });
});
