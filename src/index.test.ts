import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { method } from "./index.js";

describe("method", () => {
  test("returns a MethodDef with the given name", () => {
    const m = method("ping", { input: z.string(), output: z.number() });
    expect(m.name).toBe("ping");
  });

  test("returns a MethodDef with the correct input schema", () => {
    const inputSchema = z.object({ id: z.number() });
    const m = method("fetch", { input: inputSchema, output: z.string() });
    expect(m.input).toBe(inputSchema);
  });

  test("returns a MethodDef with the correct output schema", () => {
    const outputSchema = z.object({ result: z.boolean() });
    const m = method("check", { input: z.string(), output: outputSchema });
    expect(m.output).toBe(outputSchema);
  });

  test("input schema validates correctly", () => {
    const m = method("add", { input: z.number(), output: z.number() });
    expect(() => m.input.parse(42)).not.toThrow();
    expect(() => m.input.parse("not a number")).toThrow();
  });

  test("output schema validates correctly", () => {
    const m = method("greet", {
      input: z.string(),
      output: z.object({ message: z.string() }),
    });
    expect(() => m.output.parse({ message: "hello" })).not.toThrow();
    expect(() => m.output.parse({ message: 123 })).toThrow();
  });

  test("different calls with the same name produce independent MethodDef objects", () => {
    const a = method("x", { input: z.string(), output: z.string() });
    const b = method("x", { input: z.number(), output: z.number() });
    expect(a).not.toBe(b);
    expect(a.input).not.toBe(b.input);
  });
});
