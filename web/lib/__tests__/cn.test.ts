import { describe, expect, it } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("merges tailwind conflicts, last wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});
