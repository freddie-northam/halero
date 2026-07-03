// Router coverage for API-token management. The binding semantics under
// test: mint/list/revoke are password-session-only, the plaintext token
// appears exactly once (in the create response), and a revoked token
// stops authenticating immediately.

import { describe, expect, test } from "bun:test";
import { hashToken } from "../auth";
import {
  completeSetup,
  makeTestApp,
  type StatusData,
  type TestApp,
  type TrpcSuccess,
  trpcMutation,
  trpcQuery,
} from "../test-utils";

const FORBIDDEN_SENTENCE =
  "API tokens cannot manage other tokens. Sign in with your password.";

interface CreatedTokenData {
  readonly id: string;
  readonly name: string;
  readonly token: string;
}

interface TokenRowData {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
  readonly revokedAt: number | null;
}

interface TrpcErrorBody {
  readonly error: { readonly message: string };
}

const makeTokensApp = async (): Promise<TestApp & { cookie: string }> => {
  const testApp = makeTestApp();
  const cookie = await completeSetup(testApp.app);
  return { ...testApp, cookie };
};

const createToken = async (
  app: TestApp["app"],
  cookie: string,
  name = "Raycast",
): Promise<CreatedTokenData> => {
  const res = await trpcMutation(app, "tokens.create", { name }, { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<CreatedTokenData>;
  return json.result.data;
};

const listTokens = async (
  app: TestApp["app"],
  cookie: string,
): Promise<readonly TokenRowData[]> => {
  const res = await trpcQuery(app, "tokens.list", { cookie });
  expect(res.status).toBe(200);
  const json = (await res.json()) as TrpcSuccess<readonly TokenRowData[]>;
  return json.result.data;
};

describe("tokens.create", () => {
  test("returns the plaintext exactly once, in the halero_ format", async () => {
    const { app, cookie } = await makeTokensApp();

    const created = await createToken(app, cookie, "Raycast");

    expect(created.name).toBe("Raycast");
    expect(created.token).toMatch(/^halero_[0-9a-f]{64}$/);
    expect(created.id).not.toBe("");
  });

  test("trims the name before storing it", async () => {
    const { app, cookie } = await makeTokensApp();

    const created = await createToken(app, cookie, "  Raycast  ");

    expect(created.name).toBe("Raycast");
    const rows = await listTokens(app, cookie);
    expect(rows[0]?.name).toBe("Raycast");
  });

  test("rejects an empty name readably", async () => {
    const { app, cookie } = await makeTokensApp();

    const res = await trpcMutation(
      app,
      "tokens.create",
      { name: "   " },
      { cookie },
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("name");
  });

  test("rejects a 61-character name readably", async () => {
    const { app, cookie } = await makeTokensApp();

    const res = await trpcMutation(
      app,
      "tokens.create",
      { name: "a".repeat(61) },
      { cookie },
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("60");
  });
});

describe("tokens.list", () => {
  test("returns metadata rows and never the plaintext or its hash", async () => {
    const { app, cookie, clock } = await makeTokensApp();
    const created = await createToken(app, cookie);

    const res = await trpcQuery(app, "tokens.list", { cookie });

    expect(res.status).toBe(200);
    // Raw-byte assertion on the whole response: neither the plaintext
    // token nor its stored hash may appear anywhere in the wire bytes.
    const raw = await res.text();
    expect(raw).not.toContain(created.token);
    expect(raw).not.toContain(hashToken(created.token));
    const rows = JSON.parse(raw) as TrpcSuccess<readonly TokenRowData[]>;
    expect(rows.result.data).toEqual([
      {
        id: created.id,
        name: "Raycast",
        createdAt: clock.value,
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);
  });

  test("keeps revoked tokens listed for the audit trail", async () => {
    const { app, cookie, clock } = await makeTokensApp();
    const created = await createToken(app, cookie);
    await trpcMutation(app, "tokens.revoke", { id: created.id }, { cookie });

    const rows = await listTokens(app, cookie);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBe(clock.value);
  });
});

describe("tokens.revoke", () => {
  test("revokes once and is a no-op success on repeat", async () => {
    const { app, cookie } = await makeTokensApp();
    const created = await createToken(app, cookie);

    const first = await trpcMutation(
      app,
      "tokens.revoke",
      { id: created.id },
      { cookie },
    );
    const second = await trpcMutation(
      app,
      "tokens.revoke",
      { id: created.id },
      { cookie },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("an idempotent repeat does not move revoked_at", async () => {
    const { app, cookie, clock } = await makeTokensApp();
    const created = await createToken(app, cookie);
    await trpcMutation(app, "tokens.revoke", { id: created.id }, { cookie });
    const revokedAt = clock.value;

    clock.value += 60_000;
    await trpcMutation(app, "tokens.revoke", { id: created.id }, { cookie });

    const rows = await listTokens(app, cookie);
    expect(rows[0]?.revokedAt).toBe(revokedAt);
  });

  test("rejects an unknown id with a readable NOT_FOUND", async () => {
    const { app, cookie } = await makeTokensApp();

    const res = await trpcMutation(
      app,
      "tokens.revoke",
      { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      { cookie },
    );

    expect(res.status).toBe(404);
    // Pin the readable message itself: a bare "token" match would also
    // pass on an unknown-procedure 404, whose path contains "tokens".
    expect(await res.text()).toContain("That API token could not be found.");
  });
});

describe("token principals cannot manage tokens", () => {
  const expectForbidden = async (res: Response): Promise<void> => {
    expect(res.status).toBe(403);
    const body = (await res.json()) as TrpcErrorBody;
    expect(body.error.message).toBe(FORBIDDEN_SENTENCE);
  };

  test("list, create, and revoke all reject with the exact sentence", async () => {
    const { app, cookie } = await makeTokensApp();
    const created = await createToken(app, cookie);
    const authorization = `Bearer ${created.token}`;

    await expectForbidden(
      await trpcQuery(app, "tokens.list", { authorization }),
    );
    await expectForbidden(
      await trpcMutation(
        app,
        "tokens.create",
        { name: "X" },
        { authorization },
      ),
    );
    await expectForbidden(
      await trpcMutation(
        app,
        "tokens.revoke",
        { id: created.id },
        { authorization },
      ),
    );
  });
});

describe("revocation takes effect immediately", () => {
  test("mint, use, revoke, use again is 200 then 401", async () => {
    const { app, cookie } = await makeTokensApp();
    const created = await createToken(app, cookie);
    const authorization = `Bearer ${created.token}`;

    const before = await trpcQuery(app, "system.status", { authorization });
    expect(before.status).toBe(200);
    const status = (await before.json()) as TrpcSuccess<StatusData>;
    expect(status.result.data.authenticated).toBe(true);

    const revoked = await trpcMutation(
      app,
      "tokens.revoke",
      { id: created.id },
      { cookie },
    );
    expect(revoked.status).toBe(200);

    const after = await trpcQuery(app, "system.status", { authorization });
    expect(after.status).toBe(200);
    const afterStatus = (await after.json()) as TrpcSuccess<StatusData>;
    expect(afterStatus.result.data.authenticated).toBe(false);

    const protectedCall = await trpcQuery(app, "tokens.list", {
      authorization,
    });
    expect(protectedCall.status).toBe(401);
  });
});

describe("tokens.* without any principal", () => {
  test("rejects unauthenticated calls", async () => {
    const { app } = await makeTokensApp();

    const list = await trpcQuery(app, "tokens.list");
    const create = await trpcMutation(app, "tokens.create", { name: "X" });

    expect(list.status).toBe(401);
    expect(create.status).toBe(401);
  });
});
