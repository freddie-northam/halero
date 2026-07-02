import { describe, expect, test } from "bun:test";
import { createNotifier, type NotificationPayload } from "./notifier";
import { setSetting } from "./settings";
import { makeTestApp } from "./test-utils";

interface RecordedCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

const PAYLOAD: NotificationPayload = {
  title: "Halero sync keeps failing",
  message: "Google Calendar has failed 3 times in a row.",
  connectorId: "google-calendar",
  status: "failing",
};

const makeRecorder = (
  respond: () => Promise<Response> = () =>
    Promise.resolve(new Response("ok", { status: 200 })),
): {
  calls: RecordedCall[];
  fetchLike: (input: string | URL, init?: RequestInit) => Promise<Response>;
} => {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetchLike: (input, init) => {
      calls.push({ url: String(input), init });
      return respond();
    },
  };
};

describe("createNotifier", () => {
  test("does nothing when no notify_url is configured", async () => {
    const testApp = makeTestApp();
    const recorder = makeRecorder();
    const notifier = createNotifier({
      db: testApp.database.db,
      notifyFetch: recorder.fetchLike,
    });

    const delivered = await notifier.send(PAYLOAD);

    expect(delivered).toBe(false);
    expect(recorder.calls).toHaveLength(0);
  });

  test("posts the JSON payload to the configured URL with a timeout", async () => {
    const testApp = makeTestApp();
    setSetting(testApp.database.db, "notify_url", "https://ntfy.sh/halero");
    const recorder = makeRecorder();
    const notifier = createNotifier({
      db: testApp.database.db,
      notifyFetch: recorder.fetchLike,
    });

    const delivered = await notifier.send(PAYLOAD);

    expect(delivered).toBe(true);
    expect(recorder.calls).toHaveLength(1);
    const call = recorder.calls[0];
    expect(call?.url).toBe("https://ntfy.sh/halero");
    expect(call?.init?.method).toBe("POST");
    expect(new Headers(call?.init?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(call?.init?.body))).toEqual({ ...PAYLOAD });
    // The 5 second budget rides along as an abort signal.
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("swallows and logs a network failure", async () => {
    const testApp = makeTestApp();
    setSetting(testApp.database.db, "notify_url", "https://ntfy.sh/halero");
    const logs: string[] = [];
    const notifier = createNotifier({
      db: testApp.database.db,
      notifyFetch: () => Promise.reject(new Error("connect ECONNREFUSED")),
      log: (message) => logs.push(message),
    });

    const delivered = await notifier.send(PAYLOAD);

    expect(delivered).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("could not be delivered");
  });

  test("treats a non-2xx answer as a logged failure", async () => {
    const testApp = makeTestApp();
    setSetting(testApp.database.db, "notify_url", "https://ntfy.sh/halero");
    const logs: string[] = [];
    const recorder = makeRecorder(() =>
      Promise.resolve(new Response("nope", { status: 500 })),
    );
    const notifier = createNotifier({
      db: testApp.database.db,
      notifyFetch: recorder.fetchLike,
      log: (message) => logs.push(message),
    });

    const delivered = await notifier.send(PAYLOAD);

    expect(delivered).toBe(false);
    expect(logs[0]).toContain("500");
  });
});
