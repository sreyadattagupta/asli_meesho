// Advisory capture-freshness signal from JPEG EXIF DateTimeOriginal. Minimal in-house APP1
// parser (no new dep). EXIF is strippable, so this is NEVER a lone gate — anti-spoof stays
// behavioural (invariant #6). Any parse failure returns a neutral, zero-weight result.

export interface ExifFreshness {
  hasExif: boolean;
  capturedWithinMinutes: number | null;
  weight: number; // +0.05 fresh (<10 min), -0.05 stale (>24 h), else 0
}

const NEUTRAL: ExifFreshness = { hasExif: false, capturedWithinMinutes: null, weight: 0 };

/** Parse "YYYY:MM:DD HH:MM:SS" (EXIF format) as a local Date; null on any deviation. */
function parseExifDate(s: string): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d, h, mi, se);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function exifFreshness(buf: ArrayBuffer, now: Date = new Date()): ExifFreshness {
  try {
    const view = new DataView(buf);
    if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return NEUTRAL; // not a JPEG (SOI)

    // Walk JPEG segments for APP1 (0xFFE1) carrying an "Exif\0\0" header.
    let off = 2;
    let app1 = -1;
    while (off + 4 <= view.byteLength) {
      if (view.getUint8(off) !== 0xff) break;
      const marker = view.getUint8(off + 1);
      if (marker === 0xda) break; // start of scan — no more metadata
      const len = view.getUint16(off + 2);
      if (marker === 0xe1 && off + 4 + 6 <= view.byteLength) {
        const sig = new Uint8Array(buf, off + 4, 6); // expect 45 78 69 66 00 00 = "Exif\0\0"
        if (sig[0] === 0x45 && sig[1] === 0x78 && sig[2] === 0x69 && sig[3] === 0x66 && sig[4] === 0 && sig[5] === 0) {
          app1 = off + 4 + 6;
          break;
        }
      }
      off += 2 + len;
    }
    if (app1 < 0) return NEUTRAL;

    // TIFF header: endianness + magic 42.
    const le = view.getUint16(app1) === 0x4949; // "II" little-endian, "MM" big-endian
    const u16 = (p: number) => view.getUint16(p, le);
    const u32 = (p: number) => view.getUint32(p, le);
    if (u16(app1 + 2) !== 42) return NEUTRAL;

    const ifd0 = app1 + u32(app1 + 4);
    const readDir = (dir: number, wanted: number): number | null => {
      if (dir + 2 > view.byteLength) return null;
      const count = u16(dir);
      for (let i = 0; i < count; i++) {
        const entry = dir + 2 + i * 12;
        if (entry + 12 > view.byteLength) break;
        if (u16(entry) === wanted) return entry;
      }
      return null;
    };

    // IFD0 → ExifIFD pointer (tag 0x8769) → DateTimeOriginal (tag 0x9003, ASCII).
    const exifPtr = readDir(ifd0, 0x8769);
    if (!exifPtr) return NEUTRAL;
    const exifIfd = app1 + u32(exifPtr + 8);
    const dtEntry = readDir(exifIfd, 0x9003);
    if (!dtEntry) return NEUTRAL;

    const strOff = app1 + u32(dtEntry + 8);
    if (strOff + 19 > view.byteLength) return NEUTRAL;
    const raw = String.fromCharCode(...new Uint8Array(buf, strOff, 19));
    const captured = parseExifDate(raw);
    if (!captured) return NEUTRAL;

    const minutes = (now.getTime() - captured.getTime()) / 60000;
    const weight = minutes >= 0 && minutes < 10 ? 0.05 : minutes > 24 * 60 ? -0.05 : 0;
    return { hasExif: true, capturedWithinMinutes: Math.round(minutes), weight };
  } catch {
    return NEUTRAL;
  }
}
