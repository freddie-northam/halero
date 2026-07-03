# API tokens

API tokens are personal bearer tokens for clients that are not the Halero
web app itself: the Raycast extension, an MCP server, or a script. Each
token is a long random string prefixed `halero_`; only its SHA-256 hash is
stored, so the plaintext exists exactly once, in the response that mints
it.

A token carries the same power as your password session, including data
export. Treat it like a password: do not paste it into anywhere you would
not paste a password, and revoke it if a client that held it is lost or
retired.

## Minting a token

Tokens are minted, listed, and revoked only from a password (browser)
session; a token can never manage tokens, including itself. This keeps a
leaked token from minting itself successors or hiding its own revocation.

1. Sign in to Halero in the browser.
2. Open Settings and find the API tokens card.
3. Give the token a name (1 to 60 characters, for example "Raycast on my
   laptop") and create it.
4. Copy the token immediately. It is shown once, in the create response;
   Halero never stores or displays the plaintext again.

## Using a token

Send the token as a bearer credential on the `Authorization` header of any
request to Halero's tRPC API:

```
Authorization: Bearer halero_<the rest of the token>
```

For example, with curl against the search endpoint:

```sh
curl -s http://localhost:4253/api/trpc/system.search \
  -H "Authorization: Bearer halero_..." \
  --get --data-urlencode 'input={"query":"budget"}'
```

When a request carries an `Authorization` header at all, Halero decides
authentication from that header alone: it never falls back to the session
cookie, even if the header is malformed or the token is unknown or
revoked. Such a request is simply unauthenticated, not an error.

## Revoking a token

Revoke a token from the same API tokens card in Settings. Revoking is
idempotent: revoking an already-revoked token still succeeds. A revoked
token is refused immediately on its next use; there is no grace period.
