import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  type Connector,
  createFixtureFetch,
  defineConnector,
  jsonResponse,
  runConnectorFixture,
  type SyncOp,
} from "./index";

interface EchoConfig {
  readonly label: string;
}

/** Two-page stream fed from the injected fetch, mirroring a poll API. */
const makeEchoConnector = (): Connector<EchoConfig> =>
  defineConnector<EchoConfig>({
    manifest: {
      id: "echo",
      version: "0.0.1",
      protocolVersion: 1,
      capabilities: ["oauth2", "poll"],
      produces: [{ kind: "echo.item", schemaVersion: 1 }],
    },
    auth: {
      authorizationEndpoint: "https://auth.example.com/authorize",
      tokenEndpoint: "https://auth.example.com/token",
      scopes: ["echo.readonly"],
    },
    configSchema: z.object({ label: z.string() }),
    identify: (profile) =>
      typeof profile.sub === "string" ? { accountKey: profile.sub } : null,
    discoverStreams: async (ctx) => {
      const res = await ctx.fetch("https://api.example.com/streams");
      const body = (await res.json()) as { streams: string[] };
      return body.streams.map((id) => ({ id }));
    },
    sync: async function* (ctx, stream, cursor) {
      let page = cursor ?? "first";
      for (;;) {
        const res = await ctx.fetch(
          `https://api.example.com/${stream.id}?page=${page}`,
        );
        const body = (await res.json()) as {
          items: string[];
          next: string | null;
          cursor: string;
        };
        const ops: SyncOp[] = body.items.map((externalId) => ({
          op: "upsert",
          externalId,
          spine: {
            kind: "echo.item",
            schemaVersion: 1,
            title: `${ctx.config.label} ${externalId}`,
          },
        }));
        yield ops;
        if (body.next === null) {
          return { nextCursor: body.cursor };
        }
        page = body.next;
      }
    },
  });

const echoFixtureFetch = () =>
  createFixtureFetch((url) => {
    if (url.pathname === "/streams") {
      return jsonResponse({ streams: ["alpha"] });
    }
    if (url.pathname === "/alpha" && url.searchParams.get("page") === "first") {
      return jsonResponse({
        items: ["item-1", "item-2"],
        next: "second",
        cursor: "",
      });
    }
    if (
      url.pathname === "/alpha" &&
      url.searchParams.get("page") === "second"
    ) {
      return jsonResponse({ items: ["item-3"], next: null, cursor: "cur-2" });
    }
    return null;
  });

describe("defineConnector", () => {
  test("returns the connector unchanged", () => {
    const connector = makeEchoConnector();

    expect(defineConnector(connector)).toBe(connector);
  });
});

describe("runConnectorFixture", () => {
  test("discovers streams, collects yielded pages, and returns the cursor", async () => {
    const fixture = echoFixtureFetch();

    const run = await runConnectorFixture({
      connector: makeEchoConnector(),
      config: { label: "Echo" },
      fetch: fixture.fetch,
    });

    expect(run.streams).toHaveLength(1);
    const stream = run.streams[0];
    expect(stream?.stream.id).toBe("alpha");
    expect(stream?.pages.map((page) => page.length)).toEqual([2, 1]);
    expect(stream?.pages[0]?.[0]).toMatchObject({
      op: "upsert",
      externalId: "item-1",
      spine: { title: "Echo item-1" },
    });
    expect(stream?.nextCursor).toBe("cur-2");
  });

  test("passes the stream cursor through to the connector", async () => {
    const fixture = echoFixtureFetch();

    const run = await runConnectorFixture({
      connector: makeEchoConnector(),
      config: { label: "Echo" },
      fetch: fixture.fetch,
      cursors: { alpha: "second" },
    });

    expect(run.streams[0]?.pages.map((page) => page.length)).toEqual([1]);
  });

  test("validates the connector's config before running", async () => {
    const fixture = echoFixtureFetch();

    const outcome = await runConnectorFixture({
      connector: makeEchoConnector(),
      config: { label: 42 },
      fetch: fixture.fetch,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
  });

  test("rejects pages whose ops break the protocol schema", async () => {
    const rogue = makeEchoConnector();
    const broken: Connector<EchoConfig> = {
      ...rogue,
      sync: async function* () {
        yield [
          {
            op: "upsert",
            externalId: "item-1",
            spine: { kind: "echo.item", schemaVersion: 1 },
            satellite: { seen: new Date() },
          },
        ];
        return {};
      },
    };

    const outcome = await runConnectorFixture({
      connector: broken,
      config: { label: "Echo" },
      fetch: echoFixtureFetch().fetch,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
  });

  test("passes replayWindowStart through from the stream result", async () => {
    const windowed: Connector<EchoConfig> = {
      ...makeEchoConnector(),
      sync: async function* () {
        yield [];
        return { nextCursor: "cur-9", replayWindowStart: 1_650_000_000_000 };
      },
    };

    const run = await runConnectorFixture({
      connector: windowed,
      config: { label: "Echo" },
      fetch: echoFixtureFetch().fetch,
      streams: [{ id: "alpha" }],
    });

    expect(run.streams[0]?.nextCursor).toBe("cur-9");
    expect(run.streams[0]?.replayWindowStart).toBe(1_650_000_000_000);
  });

  test("leaves replayWindowStart undefined when the connector omits it", async () => {
    const run = await runConnectorFixture({
      connector: makeEchoConnector(),
      config: { label: "Echo" },
      fetch: echoFixtureFetch().fetch,
    });

    expect(run.streams[0]?.replayWindowStart).toBeUndefined();
  });

  test("rejects a stream result that breaks the protocol schema", async () => {
    const broken: Connector<EchoConfig> = {
      ...makeEchoConnector(),
      sync: async function* () {
        yield [];
        // NaN is a number to TypeScript but not to the protocol schema.
        return { replayWindowStart: Number.NaN };
      },
    };

    const outcome = await runConnectorFixture({
      connector: broken,
      config: { label: "Echo" },
      fetch: echoFixtureFetch().fetch,
      streams: [{ id: "alpha" }],
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
  });

  test("records every request made through the fixture fetch", async () => {
    const fixture = echoFixtureFetch();

    await runConnectorFixture({
      connector: makeEchoConnector(),
      config: { label: "Echo" },
      fetch: fixture.fetch,
    });

    expect(fixture.calls.map((call) => call.url.pathname)).toEqual([
      "/streams",
      "/alpha",
      "/alpha",
    ]);
  });

  test("the fixture fetch fails loudly on an unexpected request", async () => {
    const fixture = createFixtureFetch(() => null);

    const outcome = await fixture.fetch("https://api.example.com/unknown").then(
      () => null,
      (error: unknown) => error,
    );

    if (!(outcome instanceof Error)) {
      throw new Error("expected the fixture fetch to reject");
    }
    expect(outcome.message).toContain("unknown");
  });
});
