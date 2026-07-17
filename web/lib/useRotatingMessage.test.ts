import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { nextRotationIndex, shuffle } from "./useRotatingMessage";

describe("shuffle", () => {
  it("returns a permutation of the input without mutating it", () => {
    const input = ["a", "b", "c", "d", "e"];
    const snapshot = [...input];
    const out = shuffle(input);

    expect(input).toEqual(snapshot); // not mutated
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("guards an empty array", () => {
    expect(shuffle([])).toEqual([]);
  });
});

describe("nextRotationIndex", () => {
  it("advances by one and wraps around the end of the list", () => {
    expect(nextRotationIndex(0, 3)).toBe(1);
    expect(nextRotationIndex(1, 3)).toBe(2);
    expect(nextRotationIndex(2, 3)).toBe(0);
  });

  it("guards a zero-length list", () => {
    expect(nextRotationIndex(0, 0)).toBe(0);
    expect(nextRotationIndex(5, 0)).toBe(0);
  });
});

// useRotatingMessage itself is a hook and needs a React render to exercise end-to-end (this repo
// has no jsdom/testing-library installed and adding one is out of scope). What's actually worth
// locking down — the interval-driven advance — is the pure `nextRotationIndex` step the hook calls
// on every tick, exercised here under fake timers exactly as the hook's setInterval would drive it.
describe("rotation over fake timers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances the message once per interval, wrapping around", () => {
    const order = shuffle(["one", "two", "three"]);
    let index = 0;
    const seen: string[] = [order[index]];

    const id = setInterval(() => {
      index = nextRotationIndex(index, order.length);
      seen.push(order[index]);
    }, 3000);

    vi.advanceTimersByTime(3000);
    vi.advanceTimersByTime(3000);
    vi.advanceTimersByTime(3000); // wraps back to the start

    clearInterval(id);

    expect(seen).toEqual([order[0], order[1], order[2], order[0]]);
  });
});
