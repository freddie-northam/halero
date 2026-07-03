// The auth screens' signature: a smooth coral gradient that resolves into
// crisp brand pixels toward a focal bloom. Three layers, all reading from
// the accent token so the panel follows the brand:
//   1. a soft radial gradient field (the smooth base + depth),
//   2. a large blurred glow behind the focal point,
//   3. a grid of gapped tiles whose opacity peaks at the focal point and
//      fades to nothing at the edges, so near the focal you see crisp
//      pixels and away from it the smooth gradient shows through.
// Purely decorative, so aria-hidden. Pure DOM + inline styles (CSP-safe).

import "./signature-panel.css";

import type { CSSProperties, ReactElement } from "react";

const COLUMNS = 9;
const ROWS = 14;

// The bloom's hot spot, in normalized coordinates: right of center, a touch
// above the vertical middle.
const FOCAL_X = 0.7;
const FOCAL_Y = 0.48;
// Distance (normalized) at which the tiles have fully dissolved into the
// underlying gradient.
const FALLOFF = 0.6;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Deterministic value noise in [0, 1); pure, so no re-render flicker. */
const hashNoise = (x: number, y: number): number => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** A tile's opacity: a smooth radial falloff with a little structured
 * jitter that only bites where there is already ink, so edges stay clean. */
const tileOpacity = (row: number, column: number): number => {
  const nx = (column + 0.5) / COLUMNS;
  const ny = (row + 0.5) / ROWS;
  const dx = nx - FOCAL_X;
  const dy = (ny - FOCAL_Y) * 1.12;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // Sharpen the falloff so the corners clearly dissolve back into the
  // smooth gradient while the core stays hot and crisp.
  const core = (1 - smoothstep(0, FALLOFF, distance)) ** 1.25;
  const jitter = (hashNoise(column + 3, row + 5) - 0.5) * 0.16;
  return Math.min(1, Math.max(0, core * (0.94 + jitter)));
};

const baseGradient: CSSProperties = {
  background:
    "radial-gradient(135% 120% at 72% 48%, " +
    "color-mix(in srgb, var(--primary) 42%, white) 0%, " +
    "color-mix(in srgb, var(--primary) 10%, white) 46%, " +
    "var(--card) 100%)",
};

const glow: CSSProperties = {
  background:
    "radial-gradient(closest-side, " +
    "color-mix(in srgb, var(--primary) 55%, white), transparent)",
  filter: "blur(48px)",
};

const tileGrid: CSSProperties = {
  gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
  gridTemplateRows: `repeat(${ROWS}, 1fr)`,
};

export const SignaturePanel = (): ReactElement => {
  const tiles: ReactElement[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      tiles.push(
        <div
          key={`${row}-${column}`}
          className="rounded-[3px] bg-primary"
          style={{ opacity: Number(tileOpacity(row, column).toFixed(3)) }}
        />,
      );
    }
  }
  return (
    <div
      aria-hidden="true"
      className="relative h-full w-full overflow-hidden bg-card"
    >
      <div className="absolute inset-0" style={baseGradient} />
      <div
        className="absolute right-[10%] top-1/2 aspect-square w-2/3 -translate-y-1/2 opacity-70"
        style={glow}
      />
      <div
        className="signature-tiles absolute inset-0 grid gap-[3px] p-[3px]"
        style={tileGrid}
      >
        {tiles}
      </div>
    </div>
  );
};
