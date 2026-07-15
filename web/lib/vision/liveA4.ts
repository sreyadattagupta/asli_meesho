// Live, per-frame computer-vision validation for the guided Smart-Sizing scanner.
//
// Runs entirely in the browser on a downscaled copy of the camera frame (no server round-trip, so
// it can gate the shutter in real time). This is a PRE-gate for capture quality — the authoritative
// four-corner A4 detection + homography still happen server-side in detect.py after the shot.
//
// Signals (all measured, none hardcoded):
//   lighting     mean luminance in a usable band (too dark / blown out ⇒ fail)
//   sharpness    variance of the Laplacian (the standard no-reference focus measure)
//   a4Detected   a bright, solid, A4-aspect quad exists near the centre
//   centered     that quad's centroid sits within the overlay's centre band
//   perpendicular the quad's aspect ≈ A4 (1.414) — a tilted sheet foreshortens away from it
//   garmentVisible the sheet does not fill the frame (room around it for the garment)
//
// Everything is thresholded against documented constants tuned to be forgiving enough for a phone
// held by a real seller, strict enough that a bad frame can't be captured.

export interface FrameVerdict {
  a4Detected: boolean;
  centered: boolean;
  perpendicular: boolean;
  garmentVisible: boolean;
  sharp: boolean;
  lightingOk: boolean;
  ready: boolean;
  /** Single highest-priority instruction for the user right now. */
  guidance: string;
  metrics: {
    meanLum: number;
    focus: number;
    a4AreaFrac: number;
    fillRatio: number;
    aspect: number;
    offCenter: number;
  };
}

// ---- tunables (documented) -----------------------------------------------
const WORK_W = 320; // downscaled analysis width
const LUM_MIN = 55; // below ⇒ too dark
const LUM_MAX = 232; // above ⇒ washed out / glare
const FOCUS_MIN = 45; // variance-of-Laplacian floor for "sharp enough"
const A4_TRUE_ASPECT = 29.7 / 21.0; // 1.414
const A4_AREA_MIN = 0.05; // sheet must be at least this fraction of the frame (else move closer)
const A4_AREA_MAX = 0.55; // above this the sheet crowds out the garment (move back)
const FILL_MIN = 0.55; // bright pixels / bbox area — a solid sheet fills its box; scattered ⇒ noise
const ASPECT_TOL = 0.28; // |aspect / true − 1| within this ⇒ close to perpendicular
const CENTER_TOL = 0.22; // centroid offset from frame centre, as a fraction of the frame

function toWorkGray(source: CanvasImageSource, sw: number, sh: number): {
  gray: Float64Array; bright: Uint8Array; w: number; h: number;
} {
  const w = WORK_W;
  const h = Math.max(1, Math.round((sh / sw) * WORK_W));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float64Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // Adaptive bright threshold: a sheet is markedly brighter than the mean.
  let sum = 0;
  for (let p = 0; p < gray.length; p++) sum += gray[p];
  const mean = sum / gray.length;
  let varSum = 0;
  for (let p = 0; p < gray.length; p++) varSum += (gray[p] - mean) ** 2;
  const std = Math.sqrt(varSum / gray.length);
  const thr = Math.max(170, mean + 0.9 * std);
  const bright = new Uint8Array(w * h);
  for (let p = 0; p < gray.length; p++) bright[p] = gray[p] >= thr ? 1 : 0;
  return { gray, bright, w, h };
}

function laplacianVar(gray: Float64Array, w: number, h: number): number {
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  if (!n) return 0;
  const m = sum / n;
  return sumSq / n - m * m;
}

/** Analyse one camera frame and return the verdict + the single guidance message to show. */
export function analyzeFrame(video: HTMLVideoElement): FrameVerdict {
  const sw = video.videoWidth || 640;
  const sh = video.videoHeight || 480;
  const { gray, bright, w, h } = toWorkGray(video, sw, sh);
  const frameArea = w * h;

  // Lighting.
  let lum = 0;
  for (let p = 0; p < gray.length; p++) lum += gray[p];
  const meanLum = lum / gray.length;
  const lightingOk = meanLum >= LUM_MIN && meanLum <= LUM_MAX;

  // Sharpness.
  const focus = laplacianVar(gray, w, h);
  const sharp = focus >= FOCUS_MIN;

  // A4 blob: bounding box + centroid of bright pixels.
  let minX = w, minY = h, maxX = 0, maxY = 0, count = 0, cx = 0, cy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bright[y * w + x]) {
        count++; cx += x; cy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const a4AreaFrac = count / frameArea;
  const bboxArea = Math.max(1, (maxX - minX) * (maxY - minY));
  const fillRatio = count / bboxArea;
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  const aspect = Math.max(bw, bh) / Math.min(bw, bh);
  const centroidX = count ? cx / count : w / 2;
  const centroidY = count ? cy / count : h / 2;
  const offCenter = count
    ? Math.hypot((centroidX - w / 2) / w, (centroidY - h / 2) / h)
    : 1;

  const bigEnough = a4AreaFrac >= A4_AREA_MIN;
  const notTooBig = a4AreaFrac <= A4_AREA_MAX;
  const solid = fillRatio >= FILL_MIN;
  const a4Detected = bigEnough && notTooBig && solid;
  const centered = a4Detected && offCenter <= CENTER_TOL;
  const perpendicular = a4Detected && Math.abs(aspect / A4_TRUE_ASPECT - 1) <= ASPECT_TOL;
  const garmentVisible = notTooBig; // the sheet leaves room for the garment

  // Priority-ordered guidance — one message at a time.
  let guidance = "Align the A4 sheet inside the frame";
  if (!lightingOk) guidance = meanLum < LUM_MIN ? "Improve lighting — too dark" : "Reduce glare / bright light";
  else if (!a4Detected && !bigEnough) guidance = "Move the camera closer to the A4 sheet";
  else if (!a4Detected && !solid) guidance = "Place a plain A4 sheet flat in the frame";
  else if (!notTooBig) guidance = "Move back so the whole garment is visible";
  else if (!centered) guidance = "Center the A4 sheet in the frame";
  else if (!perpendicular) guidance = "Keep the phone flat, directly above the garment";
  else if (!sharp) guidance = "Hold steady — image is blurry";
  else guidance = "Perfect — hold still and capture";

  const ready = a4Detected && centered && perpendicular && garmentVisible && sharp && lightingOk;

  return {
    a4Detected, centered, perpendicular, garmentVisible, sharp, lightingOk, ready, guidance,
    metrics: {
      meanLum: Math.round(meanLum),
      focus: Math.round(focus),
      a4AreaFrac: Math.round(a4AreaFrac * 1000) / 1000,
      fillRatio: Math.round(fillRatio * 100) / 100,
      aspect: Math.round(aspect * 100) / 100,
      offCenter: Math.round(offCenter * 100) / 100,
    },
  };
}
