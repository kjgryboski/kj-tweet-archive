import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "./rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 3 });
    expect(limiter("127.0.0.1").allowed).toBe(true);
    expect(limiter("127.0.0.1").allowed).toBe(true);
    expect(limiter("127.0.0.1").allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2 });
    limiter("127.0.0.1");
    limiter("127.0.0.1");
    expect(limiter("127.0.0.1").allowed).toBe(false);
  });

  it("resets after window expires", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1 });
    limiter("127.0.0.1");
    expect(limiter("127.0.0.1").allowed).toBe(false);
    vi.advanceTimersByTime(60001);
    expect(limiter("127.0.0.1").allowed).toBe(true);
  });

  it("tracks IPs independently", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1 });
    limiter("1.1.1.1");
    expect(limiter("2.2.2.2").allowed).toBe(true);
  });
});
