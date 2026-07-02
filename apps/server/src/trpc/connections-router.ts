import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveBaseUrl } from "../base-url";
import {
  googleRedirectUri,
  isGoogleClientConfigured,
  isHttpsOk,
  saveGoogleClient,
} from "../google/client-config";
import {
  getGoogleConnection,
  parseConnectionConfig,
} from "../google/connection";
import { syncConnection } from "../google/sync";
import { protectedProcedure, router } from "./init";

const saveClientInput = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Enter the client ID from your Google Cloud OAuth client."),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Enter the client secret from your Google Cloud OAuth client."),
});

const NO_CONNECTION_MESSAGE =
  "Connect Google Calendar in Settings before syncing.";
const REAUTH_MESSAGE =
  "Google needs a fresh sign-in before syncing can continue. Reconnect " +
  "Google Calendar to carry on.";

const googleRouter = router({
  saveClient: protectedProcedure
    .input(saveClientInput)
    .mutation(({ ctx, input }) => {
      saveGoogleClient(ctx.db, ctx.key, input);
      return { ok: true };
    }),

  syncNow: protectedProcedure.mutation(async ({ ctx }) => {
    const connection = getGoogleConnection(ctx.db);
    if (connection === null) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: NO_CONNECTION_MESSAGE,
      });
    }
    if (connection.status === "reauth_required") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: REAUTH_MESSAGE,
      });
    }
    try {
      // Mid-run failures come back as a failed summary, never a throw;
      // anything thrown here is a guard with a readable message.
      return await syncConnection(
        {
          database: { db: ctx.db, sqlite: ctx.sqlite },
          key: ctx.key,
          now: ctx.now,
          googleFetch: ctx.googleFetch,
        },
        connection.id,
      );
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

  status: protectedProcedure.query(({ ctx }) => {
    const baseUrl = resolveBaseUrl(ctx.db, ctx.config);
    const connection = getGoogleConnection(ctx.db);
    return {
      clientConfigured: isGoogleClientConfigured(ctx.db),
      httpsOk: isHttpsOk(baseUrl),
      redirectUri: googleRedirectUri(baseUrl),
      connection:
        connection === null
          ? null
          : {
              id: connection.id,
              status: connection.status,
              email: parseConnectionConfig(connection)?.email ?? null,
              lastError: connection.lastError,
            },
    };
  }),
});

export const connectionsRouter = router({
  google: googleRouter,
});
