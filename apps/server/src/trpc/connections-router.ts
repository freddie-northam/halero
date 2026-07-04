// The generic connections surface: one catalog of integrations merged with
// live status, plus connect (apiKey), disconnect, OAuth client config, and
// sync-now. OAuth2 connect itself is a browser redirect (see the OAuth
// routes), not a procedure. Provider-specific knowledge lives in the
// catalog, the apiKey probes, and the connectors, never here.

import type { ProviderCatalogEntry } from "@halero/schemas";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveBaseUrl } from "../base-url";
import { getCatalogEntry, providerCatalog } from "../connections/catalog";
import {
  isHttpsOk,
  isOauthClientConfigured,
  oauthRedirectUri,
  saveOauthClient,
} from "../connections/oauth-client";
import { getApiKeyProbe } from "../connections/probes";
import {
  deleteConnection,
  getConnectionByConnectorId,
  parseConnectionConfig,
  upsertApiKeyConnection,
  upsertLocalConnection,
} from "../sync/connection";
import { readLastSuccessAt, readRecentRuns } from "../sync/run-queries";
import type { TrpcContext } from "./context";
import { protectedProcedure, router } from "./init";

const RECENT_RUNS_SHOWN = 5;

interface ConnectionStatus {
  readonly accountLabel: string | null;
  readonly status: "active" | "reauth_required";
  readonly lastError: string | null;
  readonly lastSyncedAt: number | null;
}

type CatalogItem = ProviderCatalogEntry & {
  readonly connection: ConnectionStatus | null;
};

const connectionStatusOf = (
  ctx: TrpcContext,
  entry: ProviderCatalogEntry,
): ConnectionStatus | null => {
  const connection = getConnectionByConnectorId(ctx.db, entry.id);
  if (connection === null) {
    return null;
  }
  return {
    accountLabel: parseConnectionConfig(connection)?.email ?? null,
    status:
      connection.status === "reauth_required" ? "reauth_required" : "active",
    lastError: connection.lastError,
    // The sync engine records run history; activity sources (e.g. GitHub)
    // report their own freshness from their module, not here.
    lastSyncedAt:
      entry.consumer === "sync-engine"
        ? readLastSuccessAt(ctx.db, connection.id)
        : null,
  };
};

const catalogEntryOrThrow = (connectorId: string): ProviderCatalogEntry => {
  const entry = getCatalogEntry(connectorId);
  if (entry === undefined || !entry.implemented) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That integration is not available in this Halero build.",
    });
  }
  return entry;
};

const badRequest = (message: string, cause?: unknown): TRPCError =>
  new TRPCError({ code: "BAD_REQUEST", message, cause });

export const connectionsRouter = router({
  /** Every catalog entry, each merged with its live connection status. */
  catalog: protectedProcedure.query(({ ctx }): CatalogItem[] =>
    providerCatalog.map((entry) => ({
      ...entry,
      connection: entry.implemented ? connectionStatusOf(ctx, entry) : null,
    })),
  ),

  /** OAuth app-config a provider's configure-client dialog needs. */
  oauthConfig: protectedProcedure
    .input(z.object({ connectorId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      const entry = catalogEntryOrThrow(input.connectorId);
      if (entry.authKind !== "oauth2") {
        throw badRequest("That integration does not use OAuth.");
      }
      const baseUrl = resolveBaseUrl(ctx.db, ctx.config);
      return {
        clientConfigured: isOauthClientConfigured(ctx.db, entry.id),
        httpsOk: isHttpsOk(baseUrl),
        redirectUri: oauthRedirectUri(baseUrl, entry.id),
      };
    }),

  /** Detailed status for one connection (sync-engine run history included). */
  status: protectedProcedure
    .input(z.object({ connectorId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      const entry = catalogEntryOrThrow(input.connectorId);
      const connection = getConnectionByConnectorId(ctx.db, entry.id);
      return {
        connection:
          connection === null
            ? null
            : {
                id: connection.id,
                status: connection.status,
                accountLabel: parseConnectionConfig(connection)?.email ?? null,
                lastError: connection.lastError,
                nextSyncAt: connection.nextSyncAt,
                consecutiveFailures: connection.consecutiveFailures,
                lastSuccessAt: readLastSuccessAt(ctx.db, connection.id),
                recentRuns: readRecentRuns(
                  ctx.db,
                  connection.id,
                  RECENT_RUNS_SHOWN,
                ),
              },
      };
    }),

  /** Stores a provider's OAuth client id + secret (self-hosted app creds). */
  saveOauthClient: protectedProcedure
    .input(
      z.object({
        connectorId: z.string().min(1),
        clientId: z.string().trim().min(1, "Enter the OAuth client ID."),
        clientSecret: z
          .string()
          .trim()
          .min(1, "Enter the OAuth client secret."),
      }),
    )
    .mutation(({ ctx, input }) => {
      const entry = catalogEntryOrThrow(input.connectorId);
      if (entry.authKind !== "oauth2") {
        throw badRequest("That integration does not use OAuth.");
      }
      saveOauthClient(ctx.db, ctx.key, entry.id, {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      });
      return { ok: true };
    }),

  /** Validates + stores a pasted token, returning the account label. */
  connectApiKey: protectedProcedure
    .input(
      z.object({
        connectorId: z.string().min(1),
        token: z.string().trim().min(1, "Paste a token to connect."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const entry = catalogEntryOrThrow(input.connectorId);
      const probe =
        entry.authKind === "apiKey" ? getApiKeyProbe(entry.id) : undefined;
      if (probe === undefined) {
        throw badRequest("That integration cannot be connected with a token.");
      }
      let accountLabel: string;
      try {
        ({ accountLabel } = await probe(ctx.outboundFetch, input.token));
      } catch (error) {
        throw badRequest(
          error instanceof Error && error.message.trim() !== ""
            ? error.message
            : "That token could not be verified.",
          error,
        );
      }
      upsertApiKeyConnection(
        ctx.db,
        ctx.key,
        ctx.now(),
        { connectorId: entry.id, displayName: entry.displayName },
        accountLabel,
        input.token,
      );
      return { connected: true as const, accountLabel };
    }),

  /** Connects a local, credential-free source (a log Halero reads on disk). */
  connectLocal: protectedProcedure
    .input(z.object({ connectorId: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const entry = catalogEntryOrThrow(input.connectorId);
      if (entry.authKind !== "none") {
        throw badRequest("That integration needs credentials to connect.");
      }
      upsertLocalConnection(ctx.db, ctx.now(), {
        connectorId: entry.id,
        displayName: entry.displayName,
      });
      return { connected: true as const };
    }),

  /** Removes a connection (keeps already-synced data). */
  disconnect: protectedProcedure
    .input(z.object({ connectorId: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const entry = catalogEntryOrThrow(input.connectorId);
      deleteConnection(ctx.db, entry.id);
      return { connected: false as const };
    }),

  /** Runs a sync now; only sync-engine connections support this. */
  syncNow: protectedProcedure
    .input(z.object({ connectorId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const entry = catalogEntryOrThrow(input.connectorId);
      if (entry.consumer !== "sync-engine") {
        throw badRequest("That integration does not sync from here.");
      }
      const connection = getConnectionByConnectorId(ctx.db, entry.id);
      if (connection === null) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Connect ${entry.displayName} before syncing.`,
        });
      }
      if (connection.status === "reauth_required") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${entry.displayName} needs a fresh sign-in before syncing can continue.`,
        });
      }
      try {
        return await ctx.syncRunner.runNow(connection.id);
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error && error.message.trim() !== ""
              ? error.message
              : "Syncing could not start. Try again shortly.",
          cause: error,
        });
      }
    }),
});
