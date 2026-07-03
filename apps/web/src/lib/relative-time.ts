/** Whole minutes from one epoch-ms instant to another, floored at 0. */
export const minutesBetween = (from: number, to: number): number =>
  Math.max(0, Math.round((to - from) / 60_000));

export const relativeTimeText = (from: number, now: number): string => {
  const minutes = minutesBetween(from, now);
  if (minutes === 0) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
};
