import { describe, expect, it } from "vitest";
import { helloWorld } from "./index.mjs";

describe("helloWorld", () => {
  it("returns a greeting", () => {
    expect(helloWorld()).toBe("Hello, world!");
  });
});
