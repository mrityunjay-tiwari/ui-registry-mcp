# ui-registry-mcp

An MCP server that gives coding agents (Claude Code, Cursor, Windsurf, …) **live
access to shadcn-style component registries** so they compose UI from real,
polished open-source components instead of rebuilding them from scratch.

The agent stays in charge of judgment — _what_ to use, _how_ to compose, _what_
to edit. This server just hands it the raw material at the moment it asks.

## The loop

```
"build a pricing page"
  → search_components("pricing")     # ranked matches across all libraries (no source)
  → get_component("reui", "form-12") # the REAL .tsx source + deps + install cmd
  → agent uses/edits it in your project
```

## Libraries (live)

| id        | name       | source                    |
| --------- | ---------- | ------------------------- |
| `reui`    | ReUI       | https://reui.io           |
| `kokonut` | Kokonut UI | https://kokonutui.com     |

Add more in [`src/registries.ts`](src/registries.ts) — one entry per shadcn
registry, nothing else changes. Origin UI / Kibo UI are stubbed there and ready
to enable once verified.

## Tools

- **`list_registries`** — what libraries are available.
- **`search_components(query, registry?, limit?)`** — ranked, lightweight
  cross-library search. Returns names + one-liners, _not_ source, so it never
  floods context.
- **`get_component(registry, name)`** — full current source (file contents),
  npm + registry dependencies, and the exact `npx shadcn add …` command.

## Setup

```bash
npm install
npm run build
```

### Live sanity checks

```bash
node dist/smoke.js        # hits the registries, prints index sizes + a sample fetch
node dist/test-client.js  # full MCP handshake via the real SDK client
```

## Connect to Claude Code

Add to your MCP config (`.mcp.json` in a project, or `claude mcp add`):

```json
{
  "mcpServers": {
    "ui-registry": {
      "command": "node",
      "args": ["E:/Web Development/Harkirat/mcp/dist/index.js"]
    }
  }
}
```

Then ask Claude to "build a pricing section using components from the registry"
— it will search, pick, fetch the real source, and edit as needed.

## Notes

- **Live fetch** with a small in-process TTL cache (`UI_REGISTRY_TTL_MS`, default
  5 min) — no maintained local mirror; every value comes from the registry JSON.
- A browser-like `User-Agent` is sent, which gets past most bot-blocking (why
  Origin/Kibo can likely be enabled).

## Next steps

- `compare_components(name)` — same-named component across libraries, side by side.
- `check_consistency(components[])` — the real UX-polish edge: flag token /
  spacing / theme clashes when mixing components from different libraries.
