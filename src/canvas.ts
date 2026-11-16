// A small software rasterizer: an RGBA pixel buffer with the shapes this
// entry needs. No dependencies, no fonts, no images loaded from disk —
// every pixel is computed here, so the render is deterministic.
import { FONT, GLYPH_ADVANCE, GLYPH_HEIGHT, GLYPH_WIDTH } from "./font.ts";

export type RGB = [number, number, number];
export type Pt = [number, number];

export function rgb(r: number, g: number, b: number): RGB {
  return [r, g, b];
}

/** Linear interpolation between two colors, t in [0, 1]. */
export function lerpColor(a: RGB, b: RGB, t: number): RGB {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    // Start fully opaque black; the scene paints over it.
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
  }

  /** Source-over blend of one pixel. */
  setPixel(x: number, y: number, c: RGB, a = 1): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const o = (iy * this.width + ix) * 4;
    const inv = 1 - a;
    this.data[o] = Math.round(c[0] * a + this.data[o] * inv);
    this.data[o + 1] = Math.round(c[1] * a + this.data[o + 1] * inv);
    this.data[o + 2] = Math.round(c[2] * a + this.data[o + 2] * inv);
    this.data[o + 3] = 255;
  }

  /** Additive blend of one pixel (for glows and sparks). */
  addPixel(x: number, y: number, c: RGB, a = 1): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const o = (iy * this.width + ix) * 4;
    this.data[o] = Math.min(255, this.data[o] + Math.round(c[0] * a));
    this.data[o + 1] = Math.min(255, this.data[o + 1] + Math.round(c[1] * a));
    this.data[o + 2] = Math.min(255, this.data[o + 2] + Math.round(c[2] * a));
    this.data[o + 3] = 255;
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.setPixel(xx, yy, c, a);
    }
  }

  /** Whole-canvas vertical gradient, top color to bottom color. */
  verticalGradient(top: RGB, bottom: RGB): void {
    for (let y = 0; y < this.height; y++) {
      const c = lerpColor(top, bottom, y / (this.height - 1));
      const o = y * this.width * 4;
      for (let x = 0; x < this.width; x++) {
        const i = o + x * 4;
        this.data[i] = c[0];
        this.data[i + 1] = c[1];
        this.data[i + 2] = c[2];
      }
    }
  }

  /** Soft additive radial glow, strongest at the center, fading to the edge. */
  radialGlow(cx: number, cy: number, radius: number, c: RGB, peak = 1): void {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        const fall = (1 - d) * (1 - d);
        this.addPixel(x, y, c, peak * fall);
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
      const x0 = Math.max(0, Math.ceil(cx - dx));
      const x1 = Math.min(this.width - 1, Math.floor(cx + dx));
      for (let x = x0; x <= x1; x++) this.setPixel(x, y, c, a);
    }
  }

  /** A stroked circle (ring), thickness in pixels. */
  ring(cx: number, cy: number, r: number, thickness: number, c: RGB, a = 1): void {
    const steps = Math.max(64, Math.ceil(2 * Math.PI * r));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      this.fillCircle(cx + Math.cos(t) * r, cy + Math.sin(t) * r, thickness / 2, c, a);
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      const dx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      const x0 = Math.max(0, Math.ceil(cx - dx));
      const x1 = Math.min(this.width - 1, Math.floor(cx + dx));
      for (let x = x0; x <= x1; x++) this.setPixel(x, y, c, a);
    }
  }

  /** Scanline-filled polygon (any simple polygon, vertices in order). */
  polygon(pts: Pt[], c: RGB, a = 1): void {
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.height - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1p] = pts[i];
        const [x2, y2p] = pts[(i + 1) % pts.length];
        if ((y1p <= y && y2p > y) || (y2p <= y && y1p > y)) {
          xs.push(x1 + ((y - y1p) / (y2p - y1p)) * (x2 - x1));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k]));
        const xb = Math.min(this.width - 1, Math.floor(xs[k + 1]));
        for (let x = xa; x <= xb; x++) this.setPixel(x, y, c, a);
      }
    }
  }

  /** Thick polyline with round joins and caps, drawn as circles along the path. */
  polyline(pts: Pt[], thickness: number, c: RGB, a = 1): void {
    if (pts.length < 2) return;
    const r = thickness / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.ceil(dist / Math.max(1, r * 0.6)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, c, a);
      }
    }
  }

  /** Thick polygon outline (closed path). */
  strokePolygon(pts: Pt[], thickness: number, c: RGB, a = 1): void {
    if (pts.length < 2) return;
    this.polyline([...pts, pts[0]], thickness, c, a);
  }

  /** Sample a quadratic bezier into a polyline. */
  static quadratic(p0: Pt, p1: Pt, p2: Pt, steps = 48): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push([
        u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
      ]);
    }
    return pts;
  }

  /** Sample a cubic bezier into a polyline. */
  static cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 64): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    return pts;
  }

  /** A 4-point sparkle star (two crossed tapered diamonds). */
  starburst(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    const w = r * 0.22;
    const pts: Pt[] = [
      [cx, cy - r],
      [cx + w, cy - w],
      [cx + r, cy],
      [cx + w, cy + w],
      [cx, cy + r],
      [cx - w, cy + w],
      [cx - r, cy],
      [cx - w, cy - w],
    ];
    this.polygon(pts, c, a);
  }

  /** Filled rounded rectangle. */
  roundedRect(x: number, y: number, w: number, h: number, r: number, c: RGB, a = 1): void {
    const rr = Math.min(r, w / 2, h / 2);
    this.fillRect(x + rr, y, w - 2 * rr, h, c, a);
    this.fillRect(x, y + rr, w, h - 2 * rr, c, a);
    this.fillCircle(x + rr, y + rr, rr, c, a);
    this.fillCircle(x + w - rr, y + rr, rr, c, a);
    this.fillCircle(x + rr, y + h - rr, rr, c, a);
    this.fillCircle(x + w - rr, y + h - rr, rr, c, a);
  }

  /** Stroked rounded rectangle (outline only). */
  strokeRoundedRect(x: number, y: number, w: number, h: number, r: number, thickness: number, c: RGB, a = 1): void {
    const rr = Math.min(r, w / 2, h / 2);
    // Straight edges.
    this.fillRect(x + rr, y, w - 2 * rr, thickness, c, a);
    this.fillRect(x + rr, y + h - thickness, w - 2 * rr, thickness, c, a);
    this.fillRect(x, y + rr, thickness, h - 2 * rr, c, a);
    this.fillRect(x + w - thickness, y + rr, thickness, h - 2 * rr, c, a);
    // Corner arcs.
    const corners: Pt[] = [
      [x + rr, y + rr],
      [x + w - rr, y + rr],
      [x + w - rr, y + h - rr],
      [x + rr, y + h - rr],
    ];
    const starts = [Math.PI, Math.PI * 1.5, 0, Math.PI * 0.5];
    for (let k = 0; k < 4; k++) {
      const [ccx, ccy] = corners[k];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = starts[k] + (i / steps) * (Math.PI / 2);
        this.fillCircle(ccx + Math.cos(t) * rr, ccy + Math.sin(t) * rr, thickness / 2, c, a);
      }
    }
  }

  /** Draw one line of bitmap-font text, top-left anchored. */
  drawText(text: string, x: number, y: number, scale: number, c: RGB, a = 1): void {
    let cx = x;
    for (const ch of text.toUpperCase()) {
      const glyph = FONT[ch] ?? FONT["?"];
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        const line = glyph[row];
        for (let col = 0; col < GLYPH_WIDTH; col++) {
          if (line[col] === "#") {
            this.fillRect(cx + col * scale, y + row * scale, scale, scale, c, a);
          }
        }
      }
      cx += GLYPH_ADVANCE * scale;
    }
  }

  /** Darken the corners and edges for a photographic vignette. */
  vignette(strength = 0.35): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const dark = strength * Math.pow(Math.max(0, d - 0.45) / 0.55, 2);
        if (dark <= 0) continue;
        const o = (y * this.width + x) * 4;
        const f = 1 - dark;
        this.data[o] = Math.round(this.data[o] * f);
        this.data[o + 1] = Math.round(this.data[o + 1] * f);
        this.data[o + 2] = Math.round(this.data[o + 2] * f);
      }
    }
  }
}
