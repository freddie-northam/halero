import { open, showToast, Toast } from "@raycast/api";
import { getPrefs } from "./api";

const parseHttpUrl = (raw: string): URL | undefined => {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
};

// Raycast requires each command file to default-export its entry point.
export default async function openHalero(): Promise<void> {
  const { baseUrl } = getPrefs();
  const url = parseHttpUrl(baseUrl);
  if (!url) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Cannot open Halero",
      message: `"${baseUrl}" is not a valid http(s) address. Update the Base URL in the extension preferences.`,
    });
    return;
  }
  await open(url.toString());
}
