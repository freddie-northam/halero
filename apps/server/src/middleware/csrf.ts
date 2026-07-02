import type { MiddlewareHandler } from "hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Absent Origin is allowed on purpose: same-origin non-CORS requests and
// non-browser clients (curl, scripts) do not send one. The allowed origin
// is resolved per request so it always matches the current base-URL
// authority (settings base_url over the env default).
export const csrfOriginCheck =
  (allowedOrigin: () => string): MiddlewareHandler =>
  async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      return next();
    }
    const origin = c.req.header("origin");
    if (origin === undefined) {
      return next();
    }
    const allowed = allowedOrigin();
    if (origin === allowed) {
      return next();
    }
    return c.json(
      {
        error:
          `This request was blocked for safety: it came from ${origin}, ` +
          `but this Halero instance only accepts changes from ${allowed}.`,
      },
      403,
    );
  };
