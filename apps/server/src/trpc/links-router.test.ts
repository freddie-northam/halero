import { describe, expect, test } from "bun:test";
import {
  completeSetup,
  makeTestApp,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

interface NeighborData {
  readonly entityId: string;
  readonly kind: string;
  readonly title: string | null;
  readonly occurredDate: string | null;
}

interface LinkData {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly neighbor: NeighborData;
}

interface LinksData {
  readonly links: readonly LinkData[];
}

const createTask = async (
  app: TestApp["app"],
  cookie: string,
  title: string,
): Promise<string> => {
  const res = await trpcMutation(
    app,
    "modules.tasks.create",
    { title },
    { cookie },
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<{ readonly entityId: string }>;
  return json.result.data.entityId;
};

const linksFor = async (
  app: TestApp["app"],
  cookie: string,
  entityId: string,
): Promise<LinksData> => {
  const procedure = `links.for?input=${encodeURIComponent(JSON.stringify({ entityId }))}`;
  const res = await trpcQuery(app, procedure, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<LinksData>;
  return json.result.data;
};

const createLink = async (
  app: TestApp["app"],
  cookie: string,
  input: {
    readonly fromId: string;
    readonly toId: string;
    readonly kind: string;
  },
): Promise<{ status: number; id?: string; message?: string }> => {
  const res = await trpcMutation(app, "links.create", input, { cookie });
  if (res.status === 200) {
    const json = (await res.json()) as TrpcSuccess<{ readonly id: string }>;
    return { status: 200, id: json.result.data.id };
  }
  const json = (await res.json()) as {
    readonly error: { readonly message: string };
  };
  return { status: res.status, message: json.error.message };
};

describe("links router", () => {
  test("relates two entities and reads the edge from both ends", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const a = await createTask(app, cookie, "Draft the proposal");
    const b = await createTask(app, cookie, "Review the proposal");

    const created = await createLink(app, cookie, {
      fromId: a,
      toId: b,
      kind: "relates_to",
    });
    expect(created.status).toBe(200);

    const fromA = await linksFor(app, cookie, a);
    expect(fromA.links).toHaveLength(1);
    expect(fromA.links[0]?.kind).toBe("relates_to");
    expect(fromA.links[0]?.label).toBe("Related to");
    expect(fromA.links[0]?.neighbor.entityId).toBe(b);
    expect(fromA.links[0]?.neighbor.title).toBe("Review the proposal");
    expect(fromA.links[0]?.neighbor.kind).toBe("task.item");

    // Symmetric: the same edge shows from the other endpoint.
    const fromB = await linksFor(app, cookie, b);
    expect(fromB.links).toHaveLength(1);
    expect(fromB.links[0]?.neighbor.entityId).toBe(a);
  });

  test("delete removes the edge", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const a = await createTask(app, cookie, "A");
    const b = await createTask(app, cookie, "B");
    const created = await createLink(app, cookie, {
      fromId: a,
      toId: b,
      kind: "relates_to",
    });

    const res = await trpcMutation(
      app,
      "links.delete",
      { id: created.id },
      { cookie },
    );
    expect(res.status).toBe(200);

    const after = await linksFor(app, cookie, a);
    expect(after.links).toHaveLength(0);
  });

  test("creating the same edge twice is idempotent", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const a = await createTask(app, cookie, "A");
    const b = await createTask(app, cookie, "B");
    const first = await createLink(app, cookie, {
      fromId: a,
      toId: b,
      kind: "relates_to",
    });
    const second = await createLink(app, cookie, {
      fromId: a,
      toId: b,
      kind: "relates_to",
    });

    expect(second.status).toBe(200);
    expect(second.id).toBe(first.id);
    const fromA = await linksFor(app, cookie, a);
    expect(fromA.links).toHaveLength(1);
  });

  test("rejects an unknown link kind", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const a = await createTask(app, cookie, "A");
    const b = await createTask(app, cookie, "B");
    const res = await createLink(app, cookie, {
      fromId: a,
      toId: b,
      kind: "bogus",
    });

    expect(res.status).toBe(400);
    expect(res.message).toContain("bogus");
  });

  test("rejects linking an entity to itself", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const a = await createTask(app, cookie, "A");
    const res = await createLink(app, cookie, {
      fromId: a,
      toId: a,
      kind: "relates_to",
    });

    expect(res.status).toBe(400);
    expect(res.message).toContain("itself");
  });

  test("rejects a link to a nonexistent entity", async () => {
    const { app } = makeTestApp();
    const cookie = await completeSetup(app);
    const a = await createTask(app, cookie, "A");
    const res = await createLink(app, cookie, {
      fromId: a,
      toId: "01000000000000000000000000",
      kind: "relates_to",
    });

    expect(res.status).toBe(404);
    expect(res.message).toBeDefined();
  });

  test("requires a session", async () => {
    const { app } = makeTestApp();
    await completeSetup(app);
    const res = await trpcQuery(
      app,
      `links.for?input=${encodeURIComponent(JSON.stringify({ entityId: "x" }))}`,
    );
    expect(res.status).toBe(401);
  });
});
