import { describe, expect, it } from "vitest";
import { exifFreshness } from "./exif";

// Build a minimal valid JPEG carrying an EXIF DateTimeOriginal (little-endian TIFF).
function jpegWithDate(dt: string): ArrayBuffer {
  const dateBytes = new Uint8Array(20); // 19 ASCII + null
  for (let i = 0; i < 19; i++) dateBytes[i] = dt.charCodeAt(i);

  const tiff = new Uint8Array(64);
  const dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49], 0);            // "II"
  dv.setUint16(2, 42, true);            // magic
  dv.setUint32(4, 8, true);             // IFD0 offset
  dv.setUint16(8, 1, true);             // IFD0 entry count
  dv.setUint16(10, 0x8769, true);       // ExifIFD pointer tag
  dv.setUint16(12, 4, true);            // type LONG
  dv.setUint32(14, 1, true);            // count
  dv.setUint32(18, 26, true);           // ExifIFD offset
  dv.setUint32(22, 0, true);            // next IFD
  dv.setUint16(26, 1, true);            // ExifIFD entry count
  dv.setUint16(28, 0x9003, true);       // DateTimeOriginal tag
  dv.setUint16(30, 2, true);            // type ASCII
  dv.setUint32(32, 20, true);           // count
  dv.setUint32(36, 44, true);           // value offset
  dv.setUint32(40, 0, true);            // next IFD
  tiff.set(dateBytes, 44);

  const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]); // "Exif\0\0"
  const payloadLen = exifHeader.length + tiff.length; // 70
  const jpeg = new Uint8Array(2 + 4 + payloadLen + 2);
  const jv = new DataView(jpeg.buffer);
  jv.setUint16(0, 0xffd8);              // SOI
  jv.setUint16(2, 0xffe1);              // APP1
  jv.setUint16(4, payloadLen + 2);      // segment length (BE)
  jpeg.set(exifHeader, 6);
  jpeg.set(tiff, 12);
  jv.setUint16(12 + tiff.length, 0xffd9); // EOI
  return jpeg.buffer;
}

const fmt = (d: Date) =>
  `${d.getFullYear()}:${String(d.getMonth() + 1).padStart(2, "0")}:${String(d.getDate()).padStart(2, "0")} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

describe("exifFreshness", () => {
  const now = new Date(2026, 6, 13, 12, 0, 0);

  it("rewards a fresh capture (<10 min)", () => {
    const r = exifFreshness(jpegWithDate(fmt(new Date(now.getTime() - 3 * 60000))), now);
    expect(r.hasExif).toBe(true);
    expect(r.weight).toBe(0.05);
    expect(r.capturedWithinMinutes).toBe(3);
  });

  it("penalizes a stale capture (>24 h)", () => {
    const r = exifFreshness(jpegWithDate(fmt(new Date(now.getTime() - 48 * 3600000))), now);
    expect(r.hasExif).toBe(true);
    expect(r.weight).toBe(-0.05);
  });

  it("returns neutral for a stripped JPEG (no EXIF)", () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(exifFreshness(bare)).toEqual({ hasExif: false, capturedWithinMinutes: null, weight: 0 });
  });

  it("returns neutral for a garbage buffer", () => {
    expect(exifFreshness(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer).weight).toBe(0);
  });
});
