// Auth-scale field styling. The app's Input/Select are deliberately dense
// (32px, 13px) for the product UI; the auth screens are a first impression
// and want roomier, softer controls. This className overrides the vendored
// components to a 44px, 10px-radius, 15px field. Shared so the login
// password, both setup passwords, the timezone select, and the base-url
// input all match. Colors still come from tokens (border-input, coral ring).
export const authFieldClassName = "h-11 rounded-xl px-3.5 text-[15px]";
