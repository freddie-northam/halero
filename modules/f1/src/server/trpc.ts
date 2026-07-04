// The F1 module's own tRPC instance, built against the request context the
// module SDK guarantees. The host's context is a structural superset, so
// procedures defined here run unchanged when mounted under modules.f1.*.

import type { ModuleRequestContext } from "@halero/module-sdk/server";
import { initTRPC, TRPCError } from "@trpc/server";

const t = initTRPC.context<ModuleRequestContext>().create();

export const moduleRouter = t.router;

/** Every F1 procedure requires a signed-in session. */
export const protectedProcedure = t.procedure.use((opts) => {
  if (opts.ctx.session === null) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in before doing that.",
    });
  }
  return opts.next();
});
