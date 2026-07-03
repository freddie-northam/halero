# Raycast extension

The Raycast extension lives in `clients/raycast`. It talks to a Halero
instance over the same tRPC API the web app uses, either unauthenticated
(Open Halero) or with an API token (everything else).

Store submission is out of scope for now; the extension runs from a local
checkout.

## Running it locally

Requires [Raycast](https://raycast.com) installed (macOS only) and Bun.
From the repository root:

```sh
cd clients/raycast
bun run dev
```

This runs `ray develop`, which builds the extension and loads it into your
local Raycast for development. Leave it running while you use the
commands below; it rebuilds on save.

Other scripts in `clients/raycast/package.json`:

```sh
bun run build      # ray build -e dist, a production build
bun run typecheck  # tsc --noEmit
```

## Commands

| Command | Mode | What it does |
| --- | --- | --- |
| Open Halero | no-view | Opens the Halero web app in your browser. Needs only the base URL. |
| Search Halero | view | Searches across everything in your Halero instance as you type. |
| Today's Agenda | view | Shows today's calendar events from Halero. |
| Add Task | no-view | Adds a task, with a title argument and an optional `YYYY-MM-DD` due date argument. |

Search Halero, Today's Agenda, and Add Task call the Halero API and need an
API token (below). Open Halero does not.

## Preferences

Set these in Raycast's extension preferences for Halero:

| Preference | Required | Default | Purpose |
| --- | --- | --- | --- |
| Base URL | No | `http://localhost:4253` | Address of your Halero instance. |
| API Token | No | none | Halero API token. Needed for Search Halero, Today's Agenda, and Add Task; not for Open Halero. |

Mint the API token from Halero's Settings page, following
[docs/api-tokens.md](api-tokens.md). Paste it into the API Token
preference. Without one, the three API commands show a toast asking for
it and link straight to the extension's preferences.
