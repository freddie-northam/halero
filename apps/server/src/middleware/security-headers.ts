import type { ErrorHandler, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Same-origin allowlist for the built SPA (hashed script/style files,
 * bundled fonts, tRPC calls back to the same host); img-src also allows
 * data: for inline favicons.
 *
 * script-src stays strict 'self', which is the boundary that actually
 * stops XSS: the app never injects markup (React escapes everything, no
 * dangerouslySetInnerHTML, search highlights strip control bytes before
 * rendering), so no attacker-controlled script can run.
 *
 * style-src needs 'unsafe-inline' because the component libraries apply
 * inline styles the browser blocks otherwise: Radix and cmdk set style
 * attributes for focus-outline management and dialog scroll-lock, and
 * Radix positioning computes inline styles at runtime that cannot be
 * hashed or nonced. This was verified against the built app with the
 * console open: the command palette and Tabs tripped style-src 'self'
 * with no functional break, so the relaxation is scoped to styles alone.
 * A style-only relaxation is low risk here precisely because we render
 * no untrusted markup, so there is no attacker-controlled style surface.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
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
