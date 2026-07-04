import { createLucideIcon, type LucideIcon } from "lucide-react";

// A racing tyre/wheel: the tyre outer, the rim, and four spokes. lucide
// ships no motorsport glyph, so this is authored in lucide's own icon
// format via createLucideIcon, which makes it a real LucideIcon that
// inherits size, stroke width, colour, and className like every other
// nav-rail glyph. Concentric circles plus straight spokes stay crisp at
// small sizes.
export const RacingTyre: LucideIcon = createLucideIcon("RacingTyre", [
  ["circle", { cx: "12", cy: "12", r: "9", key: "tyre" }],
  ["circle", { cx: "12", cy: "12", r: "3.5", key: "rim" }],
  ["path", { d: "M12 3v5.5", key: "spoke-top" }],
  ["path", { d: "M12 15.5V21", key: "spoke-bottom" }],
  ["path", { d: "M3 12h5.5", key: "spoke-left" }],
  ["path", { d: "M15.5 12H21", key: "spoke-right" }],
]);
