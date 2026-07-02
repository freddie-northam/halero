# Connecting Google Calendar

The setup itself is guided inside the app: open Settings and follow the
steps there. Halero never ships a shared Google app; you create your own
free OAuth client in Google Cloud, so your calendar data only ever flows
between Google and your instance. It takes about ten minutes, once. This
page covers the things worth knowing around that flow.

## The redirect URI

Google must be given the exact address it may send you back to:
`<your Halero address>/api/oauth/google/callback`. The Settings page shows
the exact value with a copy button; paste it into "Authorized redirect URIs"
when creating the OAuth client. If your Halero address changes later (for
example you move it behind a domain), add the new redirect URI in Google
Cloud too.

## Set the publishing status to "In production"

This step is easy to skip and it matters. While a Google Cloud app stays in
the Testing status, Google expires its sign-ins after 7 days and syncing
silently stops. On the OAuth consent screen page, click "Publish app".
Publishing needs no review from Google for personal use.

Because your app is unverified, Google shows a one-time "Google hasn't
verified this app" screen when you connect. That is expected for a personal
app: click "Advanced", then "Go to (your app's name)" to continue.

## Remote instances need HTTPS

Google refuses plain-http redirect URIs everywhere except localhost. Halero
detects when it is reached over plain http at a non-localhost address and
blocks the Google setup in Settings until that changes. The options, in
order of least effort:

1. Run Halero on the computer you browse from and open it at
   http://localhost:4253. Google allows localhost without HTTPS. This is
   the Mac recipe in [self-hosting.md](self-hosting.md).
2. Use Tailscale Serve, which gives the machine a trusted HTTPS address
   inside your tailnet with one command.
3. Serve Halero over HTTPS on a domain you own, with a reverse proxy such
   as Caddy handling the certificate.

The last two are written up in [self-hosting.md](self-hosting.md), including
the `HALERO_BASE_URL` setting that must match the new address.

## If a connection breaks later

A connection that needs re-authentication shows a Reconnect button in
Settings, and `/healthz` reports `degraded`. Set a notification URL in
Settings to get a push when that happens instead of finding out weeks
later.
