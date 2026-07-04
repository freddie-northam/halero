import { describe, expect, test } from "bun:test";
import {
  type ClientMessage,
  parseClientMessage,
  serverDataFrame,
  serverExitFrame,
} from "./protocol";

describe("parseClientMessage", () => {
  test("parses an input frame", () => {
    expect(parseClientMessage('{"type":"input","data":"ls\\n"}')).toEqual({
      type: "input",
      data: "ls\n",
    } satisfies ClientMessage);
  });

  test("parses a resize frame", () => {
    expect(
      parseClientMessage('{"type":"resize","cols":120,"rows":40}'),
    ).toEqual({ type: "resize", cols: 120, rows: 40 } satisfies ClientMessage);
  });

  test("rejects malformed json, unknown types, and bad fields", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage("42")).toBeNull();
    expect(parseClientMessage('{"type":"nope"}')).toBeNull();
    expect(parseClientMessage('{"type":"input"}')).toBeNull();
    expect(parseClientMessage('{"type":"input","data":5}')).toBeNull();
    expect(
      parseClientMessage('{"type":"resize","cols":0,"rows":40}'),
    ).toBeNull();
    expect(
      parseClientMessage('{"type":"resize","cols":80.5,"rows":40}'),
    ).toBeNull();
  });
});

describe("server frames", () => {
  test("round-trip through JSON", () => {
    expect(JSON.parse(serverDataFrame("hi"))).toEqual({
      type: "data",
      data: "hi",
    });
    expect(JSON.parse(serverExitFrame(0))).toEqual({ type: "exit", code: 0 });
  });
});
