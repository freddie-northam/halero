# Halero

Halero is an open-source, self-hostable personal OS. It connects to the tools
and services you already use (Google Calendar first), keeps a durable copy of
that data on your own machine, and builds context that follows you across
everything you do.

It runs as a single Bun process with a SQLite database: one port, one data
directory, no external services. There is no hosted version. Connector
credentials are encrypted with a key generated on first start, and the whole
instance is a directory you can copy.

Status: v0.1.0 released, v0.2 in progress. Interfaces and the database
schema can still change between commits.

## Quick start on a Mac

Running Halero on the computer you browse from is the recommended setup:
Google OAuth works over http://localhost with no HTTPS configuration.

Requires [Bun](https://bun.sh) 1.3 or newer.

```sh
git clone <repository-url> halero && cd halero
bun install
bun run build
bun start
```

Open http://localhost:4253 and complete the first-run setup (password and
home timezone). To keep Halero running in the background and across reboots,
install it as a launchd service: see
[docs/self-hosting.md](docs/self-hosting.md).

## Quick start with Docker

For a Raspberry Pi or any Linux server (the image is built for arm64 and
amd64). From a clone of this repository:

```sh
docker compose -f docker/compose.yaml up -d --build
```

Data lives in the `halero-data` volume, mounted at `/data`. Note that Google
OAuth requires HTTPS when Halero is not reached at localhost;
[docs/self-hosting.md](docs/self-hosting.md) has two recipes (Caddy on your
own domain, Tailscale Serve).

## Documentation

- [docs/self-hosting.md](docs/self-hosting.md): Mac launchd service, Docker,
  HTTPS recipes, environment variable reference.
- [docs/backup-restore.md](docs/backup-restore.md): what to back up, restore,
  upgrade and rollback procedures.
- [docs/google-calendar.md](docs/google-calendar.md): connecting Google
  Calendar, the publishing-status trap, HTTPS options.

## Development

```sh
bun install
bun test           # run all tests
bun run lint       # biome
bun run typecheck  # tsc across all workspaces
bun run --filter '@halero/server' dev   # server with hot reload on :4253
bun run --filter '@halero/web' dev      # web app with Vite proxying to :4253
```

## License

MIT, see [LICENSE](LICENSE).
