// The auth screens' signature: a pixelated bloom of the brand accent. A
// grid of flat square tiles, each painted in the accent (bg-primary) at an
// opacity that peaks at a focal point on the right edge and fades to the
// white panel toward the left and the top/bottom. Tinting from the accent
// token means it follows the brand (red after the rebrand) with no hue
// hardcoded here. Purely decorative, so aria-hidden.

import type { CSSProperties, ReactElement } from "react";

const COLUMNS = 10;
const ROWS = 12;

// The bloom's hot spot, in normalized grid coordinates (0 = left/top,
// 1 = right/bottom): just inside the right edge, a touch below center, so
// the densest tiles sit within the panel rather than clipping at the edge.
const FOCAL_X = 0.88;
const FOCAL_Y = 0.54;
// Distance at which the accent has fully faded to the panel.
const FALLOFF = 1.02;
// Vertical distances count for a bit more, so the bloom is taller than wide.
const VERTICAL_WEIGHT = 1.25;

/**
 * Deterministic value noise in [0, 1) from a cell's coordinates. Pure so
 * every render paints the same mosaic (no flicker); no Math.random.
 */
const hashNoise = (x: number, y: number): number => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** The accent opacity for one tile: a radial falloff plus a little jitter. */
const tileOpacity = (row: number, column: number): number => {
  const nx = column / (COLUMNS - 1);
  const ny = row / (ROWS - 1);
  const dx = nx - FOCAL_X;
  const dy = (ny - FOCAL_Y) * VERTICAL_WEIGHT;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // 1 at the focal point, easing to 0 at the falloff radius.
  const core = Math.max(0, 1 - distance / FALLOFF) ** 1.6;
  const jitter = (hashNoise(column + 1, row + 1) - 0.5) * 0.16;
  return Math.min(1, Math.max(0, core + jitter));
};

const gridStyle: CSSProperties = {
  gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
  gridTemplateRows: `repeat(${ROWS}, 1fr)`,
};

export const PixelMosaic = (): ReactElement => {
  const tiles: ReactElement[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      tiles.push(
        <div
          key={`${row}-${column}`}
          className="bg-primary"
          style={{ opacity: Number(tileOpacity(row, column).toFixed(3)) }}
        />,
      );
    }
  }
  return (
    <div
      aria-hidden="true"
      className="grid h-full w-full bg-card"
      style={gridStyle}
    >
      {tiles}
    </div>
  );
};
