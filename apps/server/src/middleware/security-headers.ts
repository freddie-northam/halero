import type { ErrorHandler, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Strict allowlist: the built SPA is same-origin only (hashed script and
 * style files, bundled fonts, tRPC calls back to the same host), so
 * nothing beyond 'self' is needed; img-src also allows data: for inline
 * favicons. Verified against the built app (login, setup, settings,
 * calendar) with the console open: no violations, so no relaxations.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const applySecurityHeaders = (headers: Headers): void => {
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
};

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers);
};

/**
 * A thrown error rejects the middleware chain's next(), so the
 * header-setting line above never runs and Hono builds the error
 * response outside the chain. Registering this with app.onError closes
 * that gap: error responses carry the same security headers, and a
 * plain thrown error becomes a readable 500 whose detail goes to the
 * log, never to the client.
 */
export const createSecureErrorHandler =
  (log: (error: unknown) => void = console.error): ErrorHandler =>
  (error, c) => {
    log(error);
    if (error instanceof HTTPException) {
      const res = error.getResponse();
      applySecurityHeaders(res.headers);
      return res;
    }
    const res = c.json(
      {
        error:
          "Something went wrong inside Halero. The details were written " +
          "to the server log.",
      },
      500,
    );
    applySecurityHeaders(res.headers);
    return res;
  };
