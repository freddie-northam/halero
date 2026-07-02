import { z } from "zod";
import {
  googleRedirectUri,
  isGoogleClientConfigured,
  isHttpsOk,
  resolveBaseUrl,
  saveGoogleClient,
} from "../google/client-config";
import {
  getGoogleConnection,
  parseConnectionConfig,
} from "../google/connection";
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

const googleRouter = router({
  saveClient: protectedProcedure
    .input(saveClientInput)
    .mutation(({ ctx, input }) => {
      saveGoogleClient(ctx.db, ctx.key, input);
      return { ok: true };
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
