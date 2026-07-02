import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  applyUpcasts,
  assertProducedKindSupported,
  buildKindRegistry,
  defineServerModule,
  type ServerModule,
} from "./server";

const kindModule = (
  id: string,
  kinds: readonly {
    readonly kind: string;
    readonly schemaVersion: number;
    readonly upcasts?: Readonly<
      Record<number, (old: Record<string, unknown>) => Record<string, unknown>>
    >;
  }[],
): ServerModule => ({
  id,
  version: "0.0.1",
  entityKinds: kinds.map((entry) => ({
    kind: entry.kind,
    schemaVersion: entry.schemaVersion,
    schema: z.record(z.string(), z.unknown()),
    ...(entry.upcasts === undefined ? {} : { upcasts: entry.upcasts }),
  })),
});

const caught = (run: () => void): Error => {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error("expected an Error to be thrown");
  }
  throw new Error("expected the call to throw");
};

describe("defineServerModule", () => {
  test("returns the module untouched", () => {
    const module = kindModule("calendar", [
      { kind: "calendar.event", schemaVersion: 1 },
    ]);

    expect(defineServerModule(module)).toBe(module);
  });
});

describe("buildKindRegistry", () => {
  test("indexes every contributed kind under its owning module", () => {
    const registry = buildKindRegistry([
      kindModule("calendar", [{ kind: "calendar.event", schemaVersion: 1 }]),
      kindModule("mail", [{ kind: "mail.message", schemaVersion: 3 }]),
    ]);

    expect(registry.get("calendar.event")?.moduleId).toBe("calendar");
    expect(registry.get("mail.message")?.schemaVersion).toBe(3);
    expect(registry.get("widget.gadget")).toBeUndefined();
  });

  test("rejects two modules sharing an id with a readable error", () => {
    const error = caught(() =>
      buildKindRegistry([
        kindModule("calendar", [{ kind: "calendar.event", schemaVersion: 1 }]),
        kindModule("calendar", [{ kind: "calendar.task", schemaVersion: 1 }]),
      ]),
    );

    expect(error.message).toContain('"calendar"');
    expect(error.message).toContain("unique");
  });

  test("rejects two modules claiming the same kind, naming both", () => {
    const error = caught(() =>
      buildKindRegistry([
        kindModule("calendar", [{ kind: "calendar.event", schemaVersion: 1 }]),
        kindModule("agenda", [{ kind: "calendar.event", schemaVersion: 2 }]),
      ]),
    );

    expect(error.message).toContain('"calendar.event"');
    expect(error.message).toContain('"calendar"');
    expect(error.message).toContain('"agenda"');
  });

  test("rejects a malformed module manifest before it can half-register", () => {
    expect(() =>
      buildKindRegistry([
        kindModule("", [{ kind: "calendar.event", schemaVersion: 1 }]),
      ]),
    ).toThrow(/manifest/);
  });
});

describe("assertProducedKindSupported", () => {
  const registry = buildKindRegistry([
    kindModule("widgets", [
      {
        kind: "widget.gadget",
        schemaVersion: 3,
        upcasts: {
          1: (old) => ({ ...old, upcastedFrom1: true }),
          2: (old) => ({ ...old, upcastedFrom2: true }),
        },
      },
    ]),
    kindModule("gaps", [
      {
        kind: "gap.item",
        schemaVersion: 3,
        upcasts: { 2: (old) => old },
      },
    ]),
  ]);

  test("accepts an exact schema version match without upcasts", () => {
    const bare = buildKindRegistry([
      kindModule("widgets", [{ kind: "widget.gadget", schemaVersion: 2 }]),
    ]);

    expect(() =>
      assertProducedKindSupported(bare, "echo", {
        kind: "widget.gadget",
        schemaVersion: 2,
      }),
    ).not.toThrow();
  });

  test("accepts an older version when the upcast chain covers every step", () => {
    expect(() =>
      assertProducedKindSupported(registry, "echo", {
        kind: "widget.gadget",
        schemaVersion: 1,
      }),
    ).not.toThrow();
  });

  test("rejects a kind no module registers, naming the connector", () => {
    const error = caught(() =>
      assertProducedKindSupported(registry, "echo", {
        kind: "mystery.blob",
        schemaVersion: 1,
      }),
    );

    expect(error.message).toContain('"echo"');
    expect(error.message).toContain('"mystery.blob"');
    expect(error.message).toContain("no module");
  });

  test("rejects a version newer than the module understands", () => {
    const error = caught(() =>
      assertProducedKindSupported(registry, "echo", {
        kind: "widget.gadget",
        schemaVersion: 4,
      }),
    );

    expect(error.message).toContain("4");
    expect(error.message).toContain("3");
    expect(error.message).toContain("Update Halero");
  });

  test("rejects an older version whose upcast chain has a hole", () => {
    const error = caught(() =>
      assertProducedKindSupported(registry, "echo", {
        kind: "gap.item",
        schemaVersion: 1,
      }),
    );

    expect(error.message).toContain('"gaps"');
    expect(error.message).toContain("1 to 2");
  });
});

describe("applyUpcasts", () => {
  const registry = buildKindRegistry([
    kindModule("widgets", [
      {
        kind: "widget.gadget",
        schemaVersion: 3,
        upcasts: {
          1: (old) => ({ ...old, first: true }),
          2: (old) => ({ ...old, second: true }),
        },
      },
    ]),
    kindModule("gaps", [
      { kind: "gap.item", schemaVersion: 3, upcasts: { 2: (old) => old } },
    ]),
  ]);

  const registered = (kind: string) => {
    const entry = registry.get(kind);
    if (entry === undefined) {
      throw new Error(`expected "${kind}" to be registered`);
    }
    return entry;
  };

  test("applies every step in order up to the registered version", () => {
    const result = applyUpcasts(registered("widget.gadget"), 1, {
      label: "gizmo",
    });

    expect(result).toEqual({ label: "gizmo", first: true, second: true });
  });

  test("returns the payload untouched at the registered version", () => {
    const payload = { label: "gizmo" };

    expect(applyUpcasts(registered("widget.gadget"), 3, payload)).toBe(payload);
  });

  test("fails readably when a step in the chain is missing", () => {
    const error = caught(() =>
      applyUpcasts(registered("gap.item"), 1, { label: "gizmo" }),
    );

    expect(error.message).toContain('"gaps"');
    expect(error.message).toContain("1 to 2");
  });
});
