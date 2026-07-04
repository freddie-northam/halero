import { createLucideIcon, type LucideIcon } from "lucide-react";

// A custom open-wheel Formula 1 car silhouette (two exposed wheels, a
// cockpit hump, a pointed nose, and a rear wing). lucide ships no F1 car,
// so this is authored in lucide's own icon format via createLucideIcon:
// that way it is a real LucideIcon and inherits size, stroke width, colour,
// and className exactly like the other nav-rail glyphs.
export const F1Car: LucideIcon = createLucideIcon("F1Car", [
  ["circle", { cx: "5.5", cy: "16.5", r: "2.5", key: "rear-wheel" }],
  ["circle", { cx: "18.5", cy: "16.5", r: "2.5", key: "front-wheel" }],
  // nose (right) -> up over the cockpit -> floor back to the rear axle.
  ["path", { d: "M22 15H15.5L13.5 10.5H10.5L8.5 15H2.5", key: "body" }],
  // rear wing: a strut up off the floor with a top plane.
  ["path", { d: "M4 15V11H6.5", key: "rear-wing" }],
]);
