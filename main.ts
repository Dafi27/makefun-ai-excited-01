// THE GREAT ESCAPE — entrypoint for make.fun ai-excited-01.
// Renders one original image and writes it to entry.png in the output
// directory (MAKEFUN_OUTPUT_DIR, or /output in the grading sandbox).
// Standard library only, no network, fully deterministic: two runs write
// the same bytes.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePNG } from "./src/png.ts";
import { renderEntry, SIZE } from "./src/scene.ts";

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const canvas = renderEntry();
const png = encodePNG(SIZE, SIZE, canvas.data);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), png);
console.log(`wrote entry.png: ${png.length} bytes, ${SIZE}x${SIZE}`);
