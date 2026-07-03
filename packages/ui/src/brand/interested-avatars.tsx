import { cn } from "../lib/utils";

// Purely decorative gradient circles used to signal "others are interested"
// on coming-soon connectors. No real people, no images, no network.
const PLACEHOLDERS = [
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-fuchsia-400 to-rose-500",
];

export interface InterestedAvatarsProps {
  count?: number;
  className?: string;
}

export function InterestedAvatars({
  count = 3,
  className,
}: InterestedAvatarsProps) {
  const shown = PLACEHOLDERS.slice(
    0,
    Math.max(0, Math.min(count, PLACEHOLDERS.length)),
  );

  return (
    <div className={cn("flex items-center", className)} aria-hidden="true">
      {shown.map((gradient, index) => (
        <span
          key={gradient}
          className={cn(
            "size-6 rounded-full bg-gradient-to-br ring-2 ring-background",
            gradient,
            index > 0 && "-ml-2",
          )}
        />
      ))}
    </div>
  );
}
