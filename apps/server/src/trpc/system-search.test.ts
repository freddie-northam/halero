import { describe, expect, test } from "bun:test";
import { HIGHLIGHT_END, HIGHLIGHT_START } from "@halero/core";
import { HOSTILE_SEARCH_INPUTS } from "@halero/core/testing";
import { entities } from "@halero/db";
import {
  completeSetup,
  makeTestApp,
  type TestApp,
  type TrpcSuccess,
  trpcQuery,
} from "../test-utils";

interface SearchResultData {
  readonly entityId: string;
  readonly kind: string;
  readonly title: string | null;
  readonly titleHighlighted: string;
  readonly snippetHighlighted: string | null;
  readonly occurredStart: number | null;
  readonly occurredDate: string | null;
}

interface SearchData {
  readonly results: readonly SearchResultData[];
}

interface SeedEntityInput {
  readonly id: string;
  readonly title: string | null;
  readonly snippet?: string | null;
  readonly kind?: string;
  readonly occurredStart?: number | null;
}

const seedEntity = (testApp: TestApp, input: SeedEntityInput): void => {
  testApp.database.db
    .insert(entities)
    .values({
      id: input.id,
      kind: input.kind ?? "note",
      schemaVersion: 1,
      title: input.title,
      snippet: input.snippet ?? null,
      occurredStart: input.occurredStart ?? null,
      occurredEnd: null,
      source: "user",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    })
    .run();
};

const searchRequest = (
  app: TestApp["app"],
  input: unknown,
  cookie?: string,
): Promise<Response> =>
  trpcQuery(
    app,
    `system.search?input=${encodeURIComponent(JSON.stringify(input))}`,
    cookie === undefined ? {} : { cookie },
  );

const readSearch = async (
  app: TestApp["app"],
  input: unknown,
  cookie: string,
): Promise<SearchData> => {
  const res = await searchRequest(app, input, cookie);
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<SearchData>;
  return json.result.data;
};

describe("system.search", () => {
  test("rejects requests without a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);

    const res = await searchRequest(app, { query: "plan" });

    expect(res.status).toBe(401);
  });

  test("finds seeded entities and dates them in the home timezone", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    // 23:30 UTC on June 30th is already July 1st in London (BST, UTC+1),
    // so a UTC-dated client would render the wrong day.
    seedEntity(testApp, {
      id: "ev-1",
      kind: "calendar.event",
      title: "Planning barbecue",
      occurredStart: Date.UTC(2023, 5, 30, 23, 30),
    });
    seedEntity(testApp, { id: "note-1", title: "Planning notes" });

    const { results } = await readSearch(
      testApp.app,
      { query: "plan" },
      cookie,
    );

    expect(results.map((hit) => hit.entityId).toSorted()).toEqual([
      "ev-1",
      "note-1",
    ]);
    const event = results.find((hit) => hit.entityId === "ev-1");
    expect(event?.kind).toBe("calendar.event");
    expect(event?.title).toBe("Planning barbecue");
    expect(event?.occurredStart).toBe(Date.UTC(2023, 5, 30, 23, 30));
    expect(event?.occurredDate).toBe("2023-07-01");
    expect(event?.titleHighlighted).toBe(
      `${HIGHLIGHT_START}Planning${HIGHLIGHT_END} barbecue`,
    );
  });

  test("returns a null date when the entity has no occurred time", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEntity(testApp, { id: "note-1", title: "Planning notes" });

    const { results } = await readSearch(
      testApp.app,
      { query: "plan" },
      cookie,
    );

    expect(results[0]?.occurredStart).toBeNull();
    expect(results[0]?.occurredDate).toBeNull();
  });

  test("filters by kind when given", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEntity(testApp, { id: "note-1", title: "Planning notes" });
    seedEntity(testApp, {
      id: "ev-1",
      kind: "calendar.event",
      title: "Planning session",
    });

    const { results } = await readSearch(
      testApp.app,
      { query: "plan", kind: "calendar.event" },
      cookie,
    );

    expect(results.map((hit) => hit.entityId)).toEqual(["ev-1"]);
  });

  test("rejects out-of-bounds limits with a readable message", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    for (const limit of [0, 51]) {
      const res = await searchRequest(
        testApp.app,
        { query: "plan", limit },
        cookie,
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("between 1 and 50");
    }
  });

  test("accepts the full range of valid limits", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEntity(testApp, { id: "note-1", title: "Planning notes" });
    seedEntity(testApp, { id: "note-2", title: "Planning list" });

    const capped = await readSearch(
      testApp.app,
      { query: "plan", limit: 50 },
      cookie,
    );
    const single = await readSearch(
      testApp.app,
      { query: "plan", limit: 1 },
      cookie,
    );

    expect(capped.results).toHaveLength(2);
    expect(single.results).toHaveLength(1);
  });

  test("rejects a 201-character query with a readable message", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);

    const res = await searchRequest(
      testApp.app,
      { query: "a".repeat(201) },
      cookie,
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain(
      "Search terms are limited to 200 characters.",
    );
  });

  test("returns empty results for empty and whitespace queries", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEntity(testApp, { id: "note-1", title: "Planning notes" });

    for (const query of ["", "   "]) {
      const { results } = await readSearch(testApp.app, { query }, cookie);
      expect(results).toEqual([]);
    }
  });

  test("answers every hostile injection string safely", async () => {
    const testApp = makeTestApp();
    const cookie = await completeSetup(testApp.app);
    seedEntity(testApp, {
      id: "note-1",
      title: "Planning session",
      snippet: "budget review",
    });

    for (const query of HOSTILE_SEARCH_INPUTS) {
      const res = await searchRequest(testApp.app, { query }, cookie);
      expect(res.status).toBe(200);
      const json = (await res.json()) as TrpcSuccess<SearchData>;
      expect(Array.isArray(json.result.data.results)).toBe(true);
    }
  });
});
