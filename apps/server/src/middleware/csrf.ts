import type { MiddlewareHandler } from "hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Absent Origin is allowed on purpose: same-origin non-CORS requests and
// non-browser clients (curl, scripts) do not send one.
export const csrfOriginCheck =
  (allowedOrigin: string): MiddlewareHandler =>
  async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      return next();
    }
    const origin = c.req.header("origin");
    if (origin === undefined || origin === allowedOrigin) {
      return next();
    }
    return c.json(
      {
        error:
          `This request was blocked for safety: it came from ${origin}, ` +
          `but this Halero instance only accepts changes from ${allowedOrigin}.`,
      },
      403,
    );
  };
