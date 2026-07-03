/**
 * Pure minutes formatter shared by the card's time footer and the
 * detail sheet's running total: "3h", "2h 50m", "45m", "0m". Hours only
 * appear when nonzero, and minutes are dropped when they'd be a bare
 * trailing zero (an exact hour reads "1h", not "1h 0m").
 */
export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins}m`;
  }
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
};
