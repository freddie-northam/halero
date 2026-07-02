# Self-hosting Halero

Halero is one Bun process listening on one port (4253 by default). The same
process serves the API and the built web app, runs the sync scheduler, and
takes daily backups. Everything it stores lives in one data directory:

```
<data>/
  halero.db        the SQLite database (halero.db-wal and halero.db-shm
                   appear next to it while the server runs)
  key              64-character hex key that encrypts connector credentials
  backups/         daily snapshots and pre-migration snapshots
```

Two supported deployments:

1. A Mac you use, via launchd (recommended). Google OAuth works at
   http://localhost with no HTTPS setup.
2. Docker on a Raspberry Pi or Linux server. Remote instances need HTTPS
   before Google Calendar can be connected; two recipes below.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `HALERO_PORT` | `4253` | TCP port the server listens on. |
| `HALERO_DATA_DIR` | `./data` | Data directory (database, key file, backups). Created on first start. Relative paths resolve against the working directory, so set an absolute path for services. |
| `HALERO_BASE_URL` | `http://localhost:<port>` | The address you open Halero at. Must match the browser address exactly (scheme, host, port): the CSRF origin check, the session cookie's Secure flag, and the Google OAuth redirect URI are all derived from it. A wrong value breaks sign-in and mutations. A base URL saved during first-run setup takes precedence over this variable. |
| `HALERO_KEY` | unset | Optional 64-character hex string (a 32-byte key). When set, it is used instead of the `<data>/key` file. When unset, Halero generates `<data>/key` on first start with mode 0600. |

## Mac with launchd (recommended)

### Install and first run

Requires [Bun](https://bun.sh) 1.3 or newer (`brew install oven-sh/bun/bun`
or the installer on bun.sh).

```sh
git clone <repository-url> ~/halero && cd ~/halero
bun install
bun run build
HALERO_DATA_DIR=~/halero-data bun start
```

Open http://localhost:4253, complete the first-run setup, then stop the
server with Ctrl-C and install the service below. Keep the data directory
outside the repository checkout (as above) so repository operations can
never touch it.

### The launchd service

Find your Bun path first; the plist needs it absolute:

```sh
which bun    # /opt/homebrew/bin/bun on Apple silicon, /usr/local/bin/bun on Intel
```

Create `~/Library/LaunchAgents/com.halero.plist`. Replace `/Users/you` with
your home directory (`echo $HOME`) and the Bun path with the output above:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.halero</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/bun</string>
    <string>apps/server/src/main.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/you/halero</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HALERO_DATA_DIR</key>
    <string>/Users/you/halero-data</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/you/Library/Logs/halero.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/you/Library/Logs/halero.err.log</string>
</dict>
</plist>
```

Validate, load, and check it:

```sh
plutil -lint ~/Library/LaunchAgents/com.halero.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.halero.plist
curl -s http://localhost:4253/healthz
```

`KeepAlive` restarts the process if it exits; `RunAtLoad` starts it at load
and at login. Logs go to the two files under `~/Library/Logs`. A launchd
agent runs while you are logged in, and scheduled syncs only run while the
Mac is awake; a Mac that sleeps all day syncs when it wakes.

### Upgrade

```sh
cd ~/halero
git pull
bun install --frozen-lockfile
bun run build
launchctl kickstart -k gui/$UID/com.halero
```

`kickstart -k` restarts the running service. If the new version includes
database migrations, Halero snapshots the database to
`<data>/backups/pre-<migration>-<timestamp>.db` before applying them; see
[backup-restore.md](backup-restore.md) for the rollback procedure.

### Uninstall

```sh
launchctl bootout gui/$UID/com.halero
rm ~/Library/LaunchAgents/com.halero.plist
```

The data directory is untouched; delete it yourself if you want the data
gone.

## Docker (Raspberry Pi or Linux server)

Requires Docker Engine with the compose plugin. The image is based on
`oven/bun:1.3.3-slim` (Debian), works on arm64 (Pi 4/5 with a 64-bit OS) and
amd64, runs as the non-root `bun` user, and stores data in a volume mounted
at `/data`. No image is published yet; build from a clone of this
repository:

```sh
git clone <repository-url> halero && cd halero
docker compose -f docker/compose.yaml up -d --build
curl -s http://localhost:4253/healthz
```

Or without compose:

```sh
docker build -f docker/Dockerfile -t halero:0.1.0 .
docker run -d --name halero --restart unless-stopped \
  -p 4253:4253 -v halero-data:/data halero:0.1.0
```

The container `HEALTHCHECK` probes `/healthz`. It is a liveness check, not a
readiness check: a degraded instance (a stuck connection or a stalled
scheduler) still reports a healthy container, because restarting the
container would not fix either condition. Watch the `/healthz` body or
configure a notification URL in Settings to catch degradation.

To build a multi-arch image for a registry (CI builds amd64 only; this is
the release command, run it on a machine with buildx):

```sh
docker buildx build --platform linux/amd64,linux/arm64 \
  -f docker/Dockerfile -t registry.example.com/halero:0.1.0 --push .
```

### Upgrade

```sh
cd halero
git pull
docker compose -f docker/compose.yaml up -d --build
```

Pre-migration snapshots land in the `/data` volume the same way as on a Mac.
Rollback needs the previous image or checkout plus the matching `pre-*`
snapshot; the procedure is in [backup-restore.md](backup-restore.md).

## HTTPS for remote instances

Google refuses plain-http OAuth redirect URIs everywhere except localhost,
so a Halero instance on a Pi or server needs an HTTPS address before Google
Calendar can be connected. The Settings page detects this and blocks the
Google setup until the address is HTTPS. Two recipes.

Whichever you pick, Halero must know its public address: set
`HALERO_BASE_URL` (uncomment it in `docker/compose.yaml`) to exactly the URL
in your browser's address bar, or enter that URL as the base URL during
first-run setup. If they disagree, sign-in and the OAuth flow fail.

### Caddy on your own domain

Point a DNS record for a (sub)domain at your server and open ports 80 and
443. Install Caddy from your distribution's packages, then use this
Caddyfile (`/etc/caddy/Caddyfile`):

```
halero.example.com {
    reverse_proxy localhost:4253
}
```

Caddy obtains and renews the certificate automatically. Set
`HALERO_BASE_URL=https://halero.example.com` and restart Halero. Do not also
publish port 4253 beyond localhost; with compose, change the port mapping to
`127.0.0.1:4253:4253` so only Caddy is reachable from outside.

### Tailscale Serve (no domain needed)

If the machine is in a [Tailscale](https://tailscale.com) tailnet, one
command gives it a trusted HTTPS address that only your devices can reach:

```sh
tailscale serve --bg 4253
```

This serves `https://<machine>.<tailnet>.ts.net` and proxies to
localhost:4253. HTTPS certificates and MagicDNS must be enabled once in the
Tailscale admin console (Serve prints instructions if they are not). Set
`HALERO_BASE_URL=https://<machine>.<tailnet>.ts.net` and restart Halero.

## Health checks

`GET /healthz` is unauthenticated and minimal by design: connector statuses
and timestamps, never emails, URLs, or error text.

```json
{"status":"ok","lastTickAt":1751468400000,"connections":[]}
```

`status` is `degraded` when a connection needs re-authentication, a
connection has failed three or more syncs in a row, or the scheduler has
been silent for more than five minutes. The HTTP status is 200 either way;
alerting should look at the body. For push alerts, set a notification URL
(ntfy works) in Settings.

## Future options

A single-binary build (`bun build --compile`) is a candidate for later
releases; today the supported way to run Halero is from a checkout with Bun
or the Docker image.
