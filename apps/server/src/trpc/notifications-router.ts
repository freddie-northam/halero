import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { NOTIFY_URL_SETTING } from "../notifier";
import { deleteSetting, getSetting, setSetting } from "../settings";
import { protectedProcedure, router } from "./init";

const NO_URL_MESSAGE =
  "Add a notification URL and save it before sending a test.";

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const saveInput = z.object({
  url: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || isHttpUrl(value),
      "Enter a full http(s) URL, like https://ntfy.sh/halero, or leave " +
        "it empty to turn notifications off.",
    ),
});

export const notificationsRouter = router({
  settings: protectedProcedure.query(({ ctx }) => ({
    url: getSetting(ctx.db, NOTIFY_URL_SETTING),
  })),

  save: protectedProcedure.input(saveInput).mutation(({ ctx, input }) => {
    if (input.url === "") {
      deleteSetting(ctx.db, NOTIFY_URL_SETTING);
    } else {
      setSetting(ctx.db, NOTIFY_URL_SETTING, input.url);
    }
    return { ok: true };
  }),

  sendTest: protectedProcedure.mutation(async ({ ctx }) => {
    if (getSetting(ctx.db, NOTIFY_URL_SETTING) === null) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: NO_URL_MESSAGE,
      });
    }
    // Unlike the fire-and-forget sync triggers, the test send is awaited
    // so the UI can tell the user whether delivery worked.
    const delivered = await ctx.notifier.send({
      title: "Halero test notification",
      message: "Notifications from Halero are working.",
      connectorId: "halero",
      status: "test",
    });
    return { delivered };
  }),
});
