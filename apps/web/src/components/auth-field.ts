// Auth-scale field styling. The app's Input/Select are deliberately dense
// (32px, 13px) for the product UI; the auth screens want a calmer, filled
// field. This className overrides the vendored components to a 44px, filled,
// borderless control. Shared so the login password, both setup passwords,
// the timezone select, and the base-url input all match.
export const authFieldClassName =
  "h-11 rounded-lg border-transparent bg-secondary px-3.5 text-[15px]";
