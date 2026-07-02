import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "hono";

const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Halero</title>
  </head>
  <body>
    <h1>Halero server is running</h1>
    <p>The web app is not built yet, so there is nothing to show here.</p>
  </body>
</html>
`;

export const defaultWebDistDir = (): string =>
  fileURLToPath(new URL("../../web/dist", import.meta.url));

const decodePathname = (pathname: string): string => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
};

const resolveAssetPath = (
  distRoot: string,
  pathname: string,
): string | null => {
  const candidate = resolve(join(distRoot, pathname));
  if (candidate === distRoot) {
    return null;
  }
  if (!candidate.startsWith(distRoot + sep)) {
    return null;
  }
  return candidate;
};

export const createSpaHandler =
  (webDistDir: string) =>
  async (c: Context): Promise<Response> => {
    const pathname = decodePathname(new URL(c.req.url).pathname);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return c.json({ error: "There is nothing at this API path." }, 404);
    }
    if (!existsSync(webDistDir)) {
      return c.html(PLACEHOLDER_HTML);
    }
    const distRoot = resolve(webDistDir);
    const assetPath = resolveAssetPath(distRoot, pathname);
    if (assetPath !== null) {
      const file = Bun.file(assetPath);
      if (await file.exists()) {
        return new Response(file);
      }
    }
    const index = Bun.file(join(distRoot, "index.html"));
    if (await index.exists()) {
      return new Response(index, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return c.html(PLACEHOLDER_HTML);
  };
