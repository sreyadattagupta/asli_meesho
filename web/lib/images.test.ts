import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadImageBlob } from "./images";

// The Supabase branch exists because Agent 4 could not load a frozen catalog image in production:
// with DATA_BACKEND=supabase every stored image is an absolute storage URL, loadImageBlob threw
// "unsupported image ref", and the delivery check degraded to "couldn't verify" without ever calling
// the CV service. These tests pin BOTH halves — it must load our own bucket, and it must still
// refuse every host that is not ours.
const ORIGIN = "https://proj.supabase.co";
const OBJECT = `${ORIGIN}/storage/v1/object/public/product-images/catalog/a.png`;

describe("loadImageBlob", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = ORIGIN;
  });
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    vi.unstubAllGlobals();
  });

  it("decodes a data: URL in-process without any I/O", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    // 1x1 transparent GIF
    const blob = await loadImageBlob(
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    );
    expect(blob.type).toBe("image/gif");
    expect(blob.size).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads a public object from OUR OWN Supabase bucket", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { "content-type": "image/png" },
    })));
    const blob = await loadImageBlob(OBJECT);
    expect(blob.size).toBe(3);
  });

  it("does not follow a redirect off our origin", async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([1]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await loadImageBlob(OBJECT);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });

  it("rejects a lookalike host that merely starts with our origin string", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      loadImageBlob("https://proj.supabase.co.evil.com/storage/v1/object/public/x/a.png"),
    ).rejects.toThrow(/unsupported image ref/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-public path on our own origin", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      loadImageBlob(`${ORIGIN}/storage/v1/object/private/secrets/a.png`),
    ).rejects.toThrow(/unsupported image ref/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects arbitrary external hosts and internal metadata endpoints", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const bad of [
      "https://evil.com/a.png",
      "http://169.254.169.254/latest/meta-data/",
      "//evil.com/a.png",
    ]) {
      await expect(loadImageBlob(bad)).rejects.toThrow(/unsupported image ref/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects our own storage URL when Supabase is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(loadImageBlob(OBJECT)).rejects.toThrow(/unsupported image ref/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
