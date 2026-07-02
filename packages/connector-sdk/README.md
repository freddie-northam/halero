# @halero/connector-sdk

Types, schemas, and a test harness for writing Halero connectors. A
connector declares its manifest, config schema, and OAuth spec with
`defineConnector`, then implements `discoverStreams` and `sync`.

## Testing a connector

The SDK ships the same harness Halero's own connectors use, so you can
drive a full discovery-and-sync run against canned HTTP responses
without a server. `createFixtureFetch` records every request and fails
loudly on any URL your handler does not recognize; `runConnectorFixture`
runs the connector and validates every yielded page against the
protocol schema.

```ts
import { createFixtureFetch, jsonResponse, runConnectorFixture } from "@halero/connector-sdk";
import { myConnector } from "./connector";

const fixture = createFixtureFetch((url) =>
  url.pathname === "/v1/items"
    ? jsonResponse({ items: [{ id: "a", etag: "1" }] })
    : null, // unknown URLs reject the run instead of silently 404ing
);

const run = await runConnectorFixture({
  connector: myConnector,
  config: { homeTimezone: "Europe/London" },
  fetch: fixture.fetch,
  now: () => 1_700_000_000_000,
});

// run.streams[0].pages holds the validated sync ops per page;
// run.streams[0].nextCursor is what a later run would resume from.
// Pass it back via `cursors: { [streamId]: cursor }` to test
// incremental syncs, and check fixture.calls for the exact requests.
```
