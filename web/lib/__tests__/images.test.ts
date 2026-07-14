import { describe, expect, it } from "vitest";
import { loadImageBlob } from "../images";

describe("loadImageBlob — input hardening", () => {
  it("decodes a data: URL without any I/O", async () => {
    // 1x1 transparent PNG
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const blob = await loadImageBlob(png);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("rejects external/absolute URLs (no SSRF surface)", async () => {
    await expect(loadImageBlob("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(loadImageBlob("https://evil.example/x.jpg")).rejects.toThrow();
  });

  it("rejects protocol-relative and traversal refs", async () => {
    await expect(loadImageBlob("//evil.example/x.jpg")).rejects.toThrow();
    await expect(loadImageBlob("/../../etc/passwd")).rejects.toThrow(/unsupported image type|invalid image path/);
  });

  it("rejects non-whitelisted extensions", async () => {
    await expect(loadImageBlob("/mock/delivery/../../package.json")).rejects.toThrow();
  });

  it("loads a contained /public image", async () => {
    const blob = await loadImageBlob("/mock/delivery/order-catalog.jpg");
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBeGreaterThan(0);
  });
});
