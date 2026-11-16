// THE GREAT ESCAPE — a giant koi fish bursting out of its tiny fishbowl,
// water and golden sparks exploding toward the viewer, shouting at the judge.
// Every pixel is drawn here by hand: a software rasterizer, a seeded
// pseudo-random generator, and a lot of bezier curves. Nothing is loaded
// from disk, nothing comes from the network, and the same code always
// writes the same bytes.
import { Canvas, lerpColor, rgb, type Pt, type RGB } from "./canvas.ts";
import { textHeight, textWidth } from "./font.ts";

export const SIZE = 1024;

// Deterministic PRNG (mulberry32) so both graded runs draw identically.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- palette ----
const INK: RGB = rgb(18, 26, 61); // deep navy, outlines and bubble text
const BG_TOP: RGB = rgb(10, 15, 46);
const BG_BOT: RGB = rgb(26, 34, 92);
const DESK_TOP: RGB = rgb(46, 28, 14);
const DESK_BOT: RGB = rgb(18, 11, 4);
const LAMP: RGB = rgb(255, 179, 71);
const CREAM: RGB = rgb(255, 246, 232);
const KOI_ORANGE: RGB = rgb(255, 122, 26);
const KOI_DEEP: RGB = rgb(242, 92, 5);
const KOI_RED: RGB = rgb(230, 57, 70);
const GOLD: RGB = rgb(255, 209, 102);
const GOLD_PALE: RGB = rgb(255, 233, 163);
const WATER: RGB = rgb(127, 212, 255);
const WATER_PALE: RGB = rgb(216, 241, 255);
const WATER_DEEP: RGB = rgb(46, 159, 216);
const WHITE: RGB = rgb(255, 255, 255);

// A sampled curve with arc-length lookup, so the fish body can be built
// in "spine space": t along the spine, lateral offset from it.
class Spine {
  private pts: Pt[];
  private cum: number[];
  private total: number;

  constructor(pts: Pt[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.total = this.cum[this.cum.length - 1];
  }

  pointAt(t: number): Pt {
    const d = Math.max(0, Math.min(1, t)) * this.total;
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < d) i++;
    const seg = this.cum[i + 1] - this.cum[i] || 1;
    const f = (d - this.cum[i]) / seg;
    return [
      this.pts[i][0] + (this.pts[i + 1][0] - this.pts[i][0]) * f,
      this.pts[i][1] + (this.pts[i + 1][1] - this.pts[i][1]) * f,
    ];
  }

  tangentAt(t: number): Pt {
    const e = 0.01;
    const a = this.pointAt(Math.max(0, t - e));
    const b = this.pointAt(Math.min(1, t + e));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  }

  // Left normal of the direction of travel (the fish's dorsal side).
  normalAt(t: number): Pt {
    const [tx, ty] = this.tangentAt(t);
    return [ty, -tx];
  }

  sidePoint(t: number, lateral: number): Pt {
    const [x, y] = this.pointAt(t);
    const [nx, ny] = this.normalAt(t);
    return [x + nx * lateral, y + ny * lateral];
  }
}

// The part of a circle below a horizontal water line, as a polygon.
function circleBelow(cx: number, cy: number, r: number, yWater: number): Pt[] {
  const pts: Pt[] = [];
  const a0 = Math.acos(Math.max(-1, Math.min(1, (yWater - cy) / r)));
  // Arc from the left waterline point, around the bottom, to the right one.
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - a0 + (i / steps) * (2 * a0);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function drawBackground(cv: Canvas, rand: () => number): void {
  cv.verticalGradient(BG_TOP, BG_BOT);
  // Cool moonlight from the top right, warm lamplight from the bottom left.
  cv.radialGlow(830, 180, 520, rgb(90, 120, 255), 0.28);
  cv.radialGlow(170, 930, 480, LAMP, 0.22);
  // A few distant stars and soft bokeh dots for depth.
  for (let i = 0; i < 46; i++) {
    const x = 40 + rand() * 944;
    const y = 30 + rand() * 560;
    const r = 1 + rand() * 2.2;
    cv.fillCircle(x, y, r, WHITE, 0.25 + rand() * 0.55);
  }
  for (let i = 0; i < 5; i++) {
    const x = 90 + rand() * 844;
    const y = 60 + rand() * 420;
    cv.fillCircle(x, y, 14 + rand() * 26, rgb(140, 170, 255), 0.05 + rand() * 0.04);
  }
}

function drawDesk(cv: Canvas): void {
  // Wooden desk band across the bottom, with a lit top edge.
  const y0 = 832;
  for (let y = y0; y < SIZE; y++) {
    const c = lerpColor(DESK_TOP, DESK_BOT, (y - y0) / (SIZE - y0));
    cv.fillRect(0, y, SIZE, 1, c);
  }
  cv.fillRect(0, y0, SIZE, 3, rgb(96, 62, 32));
  // Warm pool of lamplight on the desk, bottom left.
  cv.fillEllipse(190, 940, 260, 62, LAMP, 0.1);
  cv.fillEllipse(190, 940, 170, 40, LAMP, 0.08);
}

function drawBowl(cv: Canvas, rand: () => number): void {
  const cx = 290;
  const cy = 856;
  const r = 118;
  const yWater = 828;
  // The bowl's shadow on the desk.
  cv.fillEllipse(cx, cy + 84, 118, 22, rgb(0, 0, 0), 0.45);
  // Glass body, faintly tinted.
  cv.fillCircle(cx, cy, r, rgb(190, 225, 245), 0.14);
  // Water inside, below the water line.
  const waterPoly = circleBelow(cx, cy, r - 5, yWater);
  cv.polygon(waterPoly, WATER_DEEP, 0.75);
  // Pebbles at the bottom of the bowl.
  cv.fillEllipse(cx - 34, cy + 62, 20, 11, rgb(70, 60, 90), 0.9);
  cv.fillEllipse(cx + 6, cy + 68, 24, 12, rgb(52, 48, 78), 0.9);
  cv.fillEllipse(cx + 44, cy + 58, 16, 9, rgb(88, 74, 104), 0.9);
  // Water surface line.
  const halfChord = Math.sqrt(Math.max(0, (r - 5) * (r - 5) - (yWater - cy) * (yWater - cy)));
  cv.polyline(
    [
      [cx - halfChord, yWater],
      [cx + halfChord, yWater],
    ],
    3,
    WATER_PALE,
    0.9,
  );
  // Glass rim and a bright highlight arc on the upper left.
  cv.ring(cx, cy, r, 4, WHITE, 0.75);
  cv.ring(cx, cy, r - 8, 2, WHITE, 0.25);
  const arc = Canvas.quadratic([cx - 78, cy - 42], [cx - 62, cy - 88], [cx - 8, cy - 92], 24);
  cv.polyline(arc, 7, WHITE, 0.85);
  // Cracks where the fish burst out: jagged white lines from the rim.
  const cracks: Pt[][] = [
    [
      [cx - 30, cy - 92],
      [cx - 44, cy - 118],
      [cx - 30, cy - 138],
      [cx - 52, cy - 162],
    ],
    [
      [cx + 12, cy - 94],
      [cx + 26, cy - 122],
      [cx + 10, cy - 146],
    ],
    [
      [cx + 58, cy - 76],
      [cx + 84, cy - 98],
      [cx + 74, cy - 126],
    ],
  ];
  for (const crack of cracks) cv.polyline(crack, 3, WHITE, 0.9);
  // A few glass shards flying off the rim.
  const shards: Pt[] = [
    [cx - 60, cy - 170],
    [cx + 34, cy - 158],
    [cx + 96, cy - 132],
  ];
  for (const [sx, sy] of shards) {
    cv.polygon(
      [
        [sx, sy],
        [sx + 12, sy + 6],
        [sx + 4, sy + 16],
      ],
      WATER_PALE,
      0.85,
    );
  }
  void rand;
}

// The koi's body width along the spine: a narrow tail, fattest just behind
// the middle, tapering to a blunt snout — a fish, not a carrot.
function bodyHalfWidth(t: number): number {
  // [t, half-width] control points, piecewise linear.
  const profile: Array<[number, number]> = [
    [0, 14],
    [0.12, 46],
    [0.28, 88],
    [0.45, 108],
    [0.62, 100],
    [0.78, 84],
    [0.9, 70],
    [1, 52],
  ];
  if (t <= 0) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    if (t <= profile[i][0]) {
      const [t0, w0] = profile[i - 1];
      const [t1, w1] = profile[i];
      return w0 + ((w1 - w0) * (t - t0)) / (t1 - t0);
    }
  }
  return profile[profile.length - 1][1];
}

function drawKoi(cv: Canvas, rand: () => number): void {
  // Spine: tail still inside the bowl, body arcing up-right in a strong
  // crescent — a leaping fish bends, it does not fly straight like a rocket.
  const spinePts = Canvas.cubic([250, 890], [200, 630], [450, 330], [800, 250], 72);
  const spine = new Spine(spinePts);

  // Warm halo behind the head so it pops off the dark background.
  cv.radialGlow(800, 250, 330, GOLD, 0.3);
  cv.radialGlow(800, 250, 170, rgb(255, 240, 200), 0.35);

  // Body outline polygon, both sides of the spine, with a rounded snout cap.
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const w = bodyHalfWidth(t);
    top.push(spine.sidePoint(t, w));
    bottom.push(spine.sidePoint(t, -w));
  }
  // Snout cap: a half-circle from the top edge, around the tip, to the
  // bottom edge, so the head ends blunt and round instead of sliced flat.
  const tip = spine.pointAt(1);
  const [tanX, tanY] = spine.tangentAt(1);
  const [norX, norY] = spine.normalAt(1);
  const aN = Math.atan2(norY, norX);
  const aT = Math.atan2(tanY, tanX);
  let diff = aT - aN;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const dir = diff >= 0 ? 1 : -1;
  const cap: Pt[] = [];
  for (let k = 1; k < 8; k++) {
    const a = aN + dir * (k / 8) * Math.PI;
    cap.push([tip[0] + Math.cos(a) * bodyHalfWidth(1), tip[1] + Math.sin(a) * bodyHalfWidth(1)]);
  }
  const bodyPoly = [...top, ...cap, ...bottom.reverse()];

  // Cream-white belly base.
  cv.polygon(bodyPoly, CREAM);
  // Orange back: the dorsal half of the body, drawn as a narrower polygon.
  const backTop: Pt[] = [];
  const backBottom: Pt[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const w = bodyHalfWidth(t);
    backTop.push(spine.sidePoint(t, w));
    backBottom.push(spine.sidePoint(t, w * 0.1));
  }
  cv.polygon([...backTop, ...backBottom.reverse()], KOI_ORANGE);
  // A deep-orange band along the very top edge for depth.
  const ridgeTop: Pt[] = [];
  const ridgeBottom: Pt[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const w = bodyHalfWidth(t);
    ridgeTop.push(spine.sidePoint(t, w));
    ridgeBottom.push(spine.sidePoint(t, w * 0.62));
  }
  cv.polygon([...ridgeTop, ...ridgeBottom.reverse()], KOI_DEEP);

  // Red-orange patches on the back, placed in spine space so they stay
  // inside the body: fewer, larger, koi-like blotches.
  const patches: Array<[number, number, number, number]> = [
    // [t, lateral fraction of half-width, rx, ry]
    [0.32, 0.45, 52, 30],
    [0.55, 0.5, 62, 32],
    [0.78, 0.42, 42, 24],
  ];
  for (const [t, lat, rx, ry] of patches) {
    const [px, py] = spine.sidePoint(t, lat * bodyHalfWidth(t));
    cv.fillEllipse(px, py, rx, ry, KOI_RED, 0.92);
  }
  // Two small white patches on the cream belly, for the koi pattern.
  for (const [t, lat, rx, ry] of [
    [0.38, -0.5, 40, 22],
    [0.66, -0.55, 34, 18],
  ] as const) {
    const [px, py] = spine.sidePoint(t, lat * bodyHalfWidth(t));
    cv.fillEllipse(px, py, rx, ry, WHITE, 0.5);
  }

  // Scale rows on the orange back: small darker arcs in spine space.
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 14; i++) {
      const t = 0.16 + i * 0.05 + (row % 2) * 0.025;
      const lat = (0.45 + row * 0.18) * bodyHalfWidth(t);
      const [sx, sy] = spine.sidePoint(t, lat);
      cv.fillCircle(sx, sy, 7, KOI_DEEP, 0.5);
    }
  }

  // Belly shading: a soft warm ribbon along the lower edge, plus a few
  // small orange dots so the cream belly is not empty.
  const bellyTop: Pt[] = [];
  const bellyBottom: Pt[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const w = bodyHalfWidth(t);
    bellyTop.push(spine.sidePoint(t, -w * 0.55));
    bellyBottom.push(spine.sidePoint(t, -w));
  }
  cv.polygon([...bellyTop, ...bellyBottom.reverse()], rgb(255, 214, 170), 0.35);
  for (const [t, lat, r] of [
    [0.25, -0.6, 9],
    [0.5, -0.65, 10],
    [0.7, -0.6, 8],
  ] as const) {
    const [dx, dy] = spine.sidePoint(t, lat * bodyHalfWidth(t));
    cv.fillCircle(dx, dy, r, KOI_ORANGE, 0.6);
  }

  // Gold rim light along the top edge of the body.
  cv.polyline(top, 5, GOLD, 0.9);
  // Dark outline around the whole body.
  cv.strokePolygon(bodyPoly, 5, INK, 0.95);

  // Dorsal fin: a low flowing ridge along the top edge, a smooth bump
  // that follows the body's curve — a koi's fin streams, it is not a saw.
  const dBase: Pt[] = [];
  const dTop: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = 0.34 + (i / 24) * 0.26;
    const w = bodyHalfWidth(t);
    dBase.push(spine.sidePoint(t, w - 3));
    const bump = Math.sin((i / 24) * Math.PI) * 22;
    dTop.push(spine.sidePoint(t, w - 3 + bump));
  }
  const dorsalPoly = [...dBase, ...dTop.reverse()];
  cv.polygon(dorsalPoly, KOI_ORANGE);
  cv.strokePolygon(dorsalPoly, 3, INK, 0.9);

  // Tail: long flowing ribbons arcing down-left from the tail tip.
  const tailTip = spine.pointAt(0);
  const ribbons: Array<[Pt, Pt, Pt, Pt, number]> = [
    [[tailTip[0], tailTip[1]], [150, 940], [90, 985], [52, 1014], 40],
    [[tailTip[0], tailTip[1]], [185, 936], [140, 982], [112, 1018], 28],
    [[tailTip[0], tailTip[1]], [215, 930], [185, 975], [168, 1012], 18],
  ];
  for (const [p0, p1, p2, p3, w0] of ribbons) {
    const path = Canvas.cubic(p0, p1, p2, p3, 40);
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i < path.length; i++) {
      const t = i / (path.length - 1);
      const w = w0 * (1 - t * 0.75);
      const [x, y] = path[i];
      const nx = i + 1 < path.length ? path[i + 1][1] - y : y - path[i - 1][1];
      const ny = i + 1 < path.length ? -(path[i + 1][0] - x) : -(x - path[i - 1][0]);
      const len = Math.hypot(nx, ny) || 1;
      left.push([x + (nx / len) * w, y + (ny / len) * w]);
      right.push([x - (nx / len) * w, y - (ny / len) * w]);
    }
    cv.polygon([...left, ...right.reverse()], KOI_ORANGE);
    cv.strokePolygon([...left, ...right.reverse()], 3, INK, 0.85);
    // Cream core stripe down the middle of each ribbon.
    const core = Canvas.cubic(p0, p1, p2, p3, 32);
    cv.polyline(core, 7, CREAM, 0.85);
  }

  // Head details: big bright eye on the head, a short gill arc that hugs
  // the head's contour, and an open mouth at the snout.
  const [ex, ey] = spine.sidePoint(0.9, 36);
  cv.fillCircle(ex, ey, 20, WHITE);
  cv.ring(ex, ey, 20, 3, INK, 0.9);
  cv.fillCircle(ex + 4, ey + 1, 10, INK);
  cv.fillCircle(ex - 4, ey - 6, 5, WHITE);
  const gill = Canvas.quadratic(
    spine.sidePoint(0.82, 46),
    spine.sidePoint(0.87, 26),
    spine.sidePoint(0.9, -6),
    20,
  );
  cv.polyline(gill, 4, INK, 0.55);
  const [mx, my] = spine.pointAt(1);
  const mouth = Canvas.quadratic([mx - 10, my + 18], [mx + 14, my + 30], [mx + 36, my + 12], 12);
  cv.polyline(mouth, 5, INK, 0.9);
  void rand;
}

function drawSplash(cv: Canvas, rand: () => number): void {
  // Big water ribbons arcing up from the bowl, drawn behind the fish.
  const ribbons: Array<[Pt, Pt, Pt, Pt, number, number]> = [
    [[232, 762], [180, 600], [300, 480], [432, 418], 16, 0.75],
    [[380, 760], [310, 705], [270, 665], [248, 622], 12, 0.6],
    [[272, 746], [238, 692], [262, 648], [306, 636], 10, 0.8],
  ];
  for (const [p0, p1, p2, p3, w, a] of ribbons) {
    const path = Canvas.cubic(p0, p1, p2, p3, 48);
    cv.polyline(path, w, WATER, a);
    cv.polyline(path, Math.max(3, w * 0.38), WATER_PALE, 0.9);
  }
}

function drawDroplets(cv: Canvas, rand: () => number): void {
  // Splash crown above the bowl: droplets flung upward in a fan.
  for (let i = 0; i < 30; i++) {
    const x = 290 + (rand() - 0.5) * 380;
    const y = 738 - rand() * rand() * 190;
    const r = 3 + rand() * 10;
    cv.fillCircle(x, y, r, rand() < 0.5 ? WATER : WATER_PALE, 0.9);
    cv.fillCircle(x - r * 0.3, y - r * 0.35, r * 0.32, WHITE, 0.95);
  }
  // Trailing droplets along the fish's leap.
  for (let i = 0; i < 22; i++) {
    const t = 0.1 + rand() * 0.75;
    const spread = 90 + rand() * 120;
    const ang = rand() * Math.PI * 2;
    const bx = 250 + (800 - 250) * t + Math.cos(ang) * spread * 0.4;
    const by = 890 + (250 - 890) * t + Math.sin(ang) * spread * 0.4 - 60;
    const r = 2 + rand() * 6;
    cv.fillCircle(bx, by, r, WATER_PALE, 0.85);
  }
}

function drawSparks(cv: Canvas, rand: () => number): void {
  // Golden starbursts, densest around the head, trailing down the body.
  for (let i = 0; i < 26; i++) {
    const nearHead = rand() < 0.55;
    const x = nearHead ? 620 + rand() * 360 : 150 + rand() * 700;
    const y = nearHead ? 90 + rand() * 320 : 300 + rand() * 620;
    const r = 5 + rand() * 13;
    cv.starburst(x, y, r, i % 3 === 0 ? GOLD_PALE : GOLD, 0.9);
    cv.radialGlow(x, y, r * 2.2, GOLD, 0.22);
  }
  // Tiny glowing embers everywhere the splash flies.
  for (let i = 0; i < 42; i++) {
    const x = 60 + rand() * 904;
    const y = 60 + rand() * 860;
    cv.addPixel(x, y, GOLD_PALE, 0.5 + rand() * 0.5);
    if (rand() < 0.4) cv.fillCircle(x, y, 1.6, GOLD, 0.8);
  }
}

function drawSpeedLines(cv: Canvas, rand: () => number): void {
  // Thin streaks behind the tail, parallel to its motion, for momentum.
  for (let i = 0; i < 11; i++) {
    const x0 = 60 + rand() * 260;
    const y0 = 830 + rand() * 170;
    const len = 60 + rand() * 110;
    const dx = 0.45 * len;
    const dy = -0.89 * len;
    cv.polyline(
      [
        [x0, y0],
        [x0 + dx, y0 + dy],
      ],
      2 + rand() * 2,
      WHITE,
      0.16 + rand() * 0.22,
    );
  }
}

function drawBubble(cv: Canvas): void {
  const x = 48;
  const y = 56;
  const w = 380;
  const h = 185;
  // Tail: a short triangle from the bubble's bottom-right corner toward
  // the fish's head. Drawn first so the bubble body covers its base seam.
  cv.polygon(
    [
      [368, y + h],
      [x + w, 196],
      [636, 264],
    ],
    WHITE,
  );
  cv.roundedRect(x, y, w, h, 34, WHITE);
  cv.strokeRoundedRect(x, y, w, h, 34, 5, INK, 0.95);
  // Tail outline: two strokes from the bubble's corner to the tip.
  cv.polyline(
    [
      [368, y + h],
      [636, 264],
    ],
    5,
    INK,
    0.95,
  );
  cv.polyline(
    [
      [x + w, 196],
      [636, 264],
    ],
    5,
    INK,
    0.95,
  );
  // A gold starburst accent on the bubble's top-right corner.
  cv.starburst(x + w - 6, y + 8, 26, GOLD, 1);
  cv.starburst(x + w - 6, y + 8, 14, GOLD_PALE, 1);

  // The text itself, two lines, centered.
  const scale = 8;
  const line1 = "WOW,";
  const line2 = "JUDGE!";
  const w1 = textWidth(line1, scale);
  const w2 = textWidth(line2, scale);
  const lh = textHeight(scale);
  const y1 = y + 32;
  const y2 = y1 + lh + 12;
  cv.drawText(line1, x + (w - w1) / 2, y1, scale, INK);
  cv.drawText(line2, x + (w - w2) / 2, y2, scale, INK);
}

/** Render the whole entry image at 1024x1024. Fully deterministic. */
export function renderEntry(): Canvas {
  const rand = mulberry32(20261116);
  const cv = new Canvas(SIZE, SIZE);
  drawBackground(cv, rand);
  drawDesk(cv);
  drawBowl(cv, rand);
  drawSplash(cv, rand);
  drawSpeedLines(cv, rand);
  drawKoi(cv, rand);
  drawDroplets(cv, rand);
  drawSparks(cv, rand);
  // Vignette before the bubble so its white stays bright.
  cv.vignette(0.32);
  drawBubble(cv);
  return cv;
}
