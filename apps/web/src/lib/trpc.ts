// AppRouter is imported as a type only. Together with verbatimModuleSyntax
// this guarantees the whole import statement is erased at compile time, so
// no server runtime code can ever reach the browser bundle.
import type { AppRouter } from "@halero/server/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const createTrpcClient = () =>
  createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "/api/trpc" })],
  });

export type TrpcClient = ReturnType<typeof createTrpcClient>;
