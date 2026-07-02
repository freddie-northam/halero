import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use((opts) => {
  if (opts.ctx.session === null) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in before doing that.",
    });
  }
  return opts.next({ ctx: { ...opts.ctx, session: opts.ctx.session } });
});
