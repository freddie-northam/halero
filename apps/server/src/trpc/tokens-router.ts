// API-token management. Show-once is the load-bearing rule here: the
// plaintext token exists in exactly one response, tokens.create; list
// returns metadata only and the hash never leaves the database.

import { apiTokens } from "@halero/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createApiToken, mintApiTokenValue } from "../api-tokens";
import { protectedProcedure, router } from "./init";

const TOKEN_MANAGEMENT_FORBIDDEN =
  "API tokens cannot manage other tokens. Sign in with your password.";

/**
 * All three procedures, including list, require a password (cookie)
 * session. A leaked token must not be able to mint itself successors,
 * hide its revocation, or enumerate its siblings.
 */
const passwordProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.kind !== "password") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: TOKEN_MANAGEMENT_FORBIDDEN,
    });
  }
  return next();
});

const createInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the token a name, like Raycast on my laptop.")
    .max(60, "Keep the token name to 60 characters or fewer."),
});

export const tokensRouter = router({
  list: passwordProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id))
      .all(),
  ),

  create: passwordProcedure.input(createInput).mutation(({ ctx, input }) => {
    const tokenValue = mintApiTokenValue();
    const id = createApiToken(ctx.db, input.name, tokenValue, ctx.now());
    // The only place the plaintext ever appears. It is not stored, so
    // it cannot be shown again.
    return { id, name: input.name, token: tokenValue };
  }),

  revoke: passwordProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      const row = ctx.db
        .select({ id: apiTokens.id, revokedAt: apiTokens.revokedAt })
        .from(apiTokens)
        .where(eq(apiTokens.id, input.id))
        .get();
      if (row === undefined) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That API token could not be found.",
        });
      }
      // Idempotent: revoking a revoked token succeeds without moving
      // revoked_at, so a double-click or a retry never errors.
      if (row.revokedAt === null) {
        ctx.db
          .update(apiTokens)
          .set({ revokedAt: ctx.now() })
          .where(eq(apiTokens.id, input.id))
          .run();
      }
      return { ok: true };
    }),
});
