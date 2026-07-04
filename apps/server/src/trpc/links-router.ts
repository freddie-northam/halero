// The host's relationship layer: read, create, and delete typed edges in
// the entity graph. Edges live in the `links` table and are validated
// against the boot-built link-kind registry, so the graph stays a
// governed vocabulary rather than a free-form string field. Neighbors
// come back with the same home-timezone `occurredDate` the search palette
// uses, so the web app routes a related item exactly like a search hit.

import { dateStringInZone } from "@halero/connector-sdk";
import type { EntityRow } from "@halero/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { linkKindRegistry } from "../registry";
import { getSetting } from "../settings";
import type { TrpcContext } from "./context";
import { protectedProcedure, router } from "./init";

const forInput = z.object({ entityId: z.string().min(1) });
const createInput = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: z.string().min(1),
});
const deleteInput = z.object({ id: z.string().min(1) });

const NOT_FOUND_MESSAGE = "That item could not be found.";

/** Loads an entity a link may touch, rejecting a missing or deleted one. */
const liveEntity = (ctx: TrpcContext, id: string): EntityRow => {
  const row = ctx.entities.getEntity(id);
  if (row === null || row.deletedAt !== null) {
    throw new TRPCError({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
  }
  return row;
};

/** A typed link kind constrains its endpoints; "*" accepts any kind. */
const assertEndpoint = (
  allowed: string,
  actualKind: string,
  linkKind: string,
): void => {
  if (allowed !== "*" && allowed !== actualKind) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A "${linkKind}" relationship cannot include a "${actualKind}" item.`,
    });
  }
};

const occurredDateOf = (row: EntityRow, homeTimezone: string): string | null =>
  row.occurredStart === null
    ? null
    : dateStringInZone(row.occurredStart, homeTimezone);

export const linksRouter = router({
  // Every edge touching the entity, from either endpoint, newest first.
  // Each carries the neighbor's spine so the client renders without a
  // second round trip, and skips edges whose neighbor is gone.
  for: protectedProcedure.input(forInput).query(({ ctx, input }) => {
    const entityId = ctx.entities.resolveAlias(input.entityId);
    const homeTimezone = getSetting(ctx.db, "home_timezone") ?? "UTC";
    const rows = [...ctx.entities.getLinksFor(entityId)].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const links = [];
    for (const row of rows) {
      const isFrom = row.fromId === entityId;
      const neighborId = isFrom ? row.toId : row.fromId;
      const neighbor = ctx.entities.getEntity(neighborId);
      if (neighbor === null || neighbor.deletedAt !== null) {
        continue;
      }
      const registered = linkKindRegistry.get(row.kind);
      const label =
        registered === undefined
          ? row.kind
          : isFrom
            ? registered.label
            : (registered.inverseLabel ?? registered.label);
      links.push({
        id: row.id,
        kind: row.kind,
        label,
        neighbor: {
          entityId: neighbor.id,
          kind: neighbor.kind,
          title: neighbor.title,
          occurredDate: occurredDateOf(neighbor, homeTimezone),
        },
      });
    }
    return { links };
  }),

  create: protectedProcedure.input(createInput).mutation(({ ctx, input }) => {
    const registered = linkKindRegistry.get(input.kind);
    if (registered === undefined) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `"${input.kind}" is not a known relationship type.`,
      });
    }
    // Resolve aliases first so a merged entity's old id still links.
    const fromId = ctx.entities.resolveAlias(input.fromId);
    const toId = ctx.entities.resolveAlias(input.toId);
    if (fromId === toId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "An item cannot be linked to itself.",
      });
    }
    const from = liveEntity(ctx, fromId);
    const to = liveEntity(ctx, toId);
    assertEndpoint(registered.from, from.kind, registered.kind);
    assertEndpoint(registered.to, to.kind, registered.kind);
    const link = ctx.entities.createLink({
      fromId,
      toId,
      kind: registered.kind,
      source: "user",
    });
    return { id: link.id };
  }),

  delete: protectedProcedure.input(deleteInput).mutation(({ ctx, input }) => {
    ctx.entities.deleteLink(input.id);
    return { ok: true };
  }),
});
