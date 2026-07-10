# ui-registry-mcp

An MCP server that gives coding agents (Claude Code, Cursor, Windsurf, …) **live
access to shadcn-style component registries** so they compose UI from real,
polished open-source components instead of rebuilding them from scratch.

The agent stays in charge of judgment — _what_ to use, _how_ to compose, _what_
to edit. This server just hands it the raw material at the moment it asks, and
flags design clashes before they ship.

## The loop

```
"build a pricing page"
  → search_components("pricing")        # ranked matches across all libraries (no source)
  → compare_components("pricing table") # best match from each library, side by side
  → get_component("reui", "form-12")    # the REAL .tsx source + deps + install cmd
  → agent uses / edits it in your project
  → check_consistency([...])            # radius / color-token / dark-mode / dep clashes
```

## Libraries (live)

| id        | name       | source                    | approx. components |
| --------- | ---------- | ------------------------- | ------------------ |
| `reui`    | ReUI       | https://reui.io           | ~1534              |
| `kokonut` | Kokonut UI | https://kokonutui.com     | ~40                |
| `kibo`    | Kibo UI    | https://www.kibo-ui.com   | ~41                |

Add more in [`src/registries.ts`](src/registries.ts) — one entry per shadcn
registry, nothing else changes.

> **Origin UI** is intentionally not enabled: `originui.com` serves an HTML app
> page (Vercel deployment protection) for every `/r/*.json` path rather than
> registry JSON, so there is no public static endpoint to fetch. Revisit if they
> publish a JSON registry or CDN mirror.

## Tools

| tool | what it does |
| --- | --- |
| **`list_registries`** | The libraries available (id, name, homepage). |
| **`search_components(query, registry?, type?, verified?, limit?)`** | Token-ranked, **synonym-aware** cross-library search (`modal`→`dialog`, `dropdown`→`select`, …). Returns names + one-liners, _not_ source, so it never floods context. `type` filters to `ui` / `block` / `component` / `hook` (`ui` spans single components across libraries). `verified:true` fetch-checks results and returns only **installable** ones (drops premium/gated items — slower). Empty result = `[]`. |
| **`get_component(registry, name)`** | Full current source (file contents), npm + registry dependencies, and the exact `npx shadcn add …` command. |
| **`compare_components(query, registries?)`** | The best match for an intent from _each_ library, side by side: deps, file count, LOC, install command, source preview — so the agent picks the nicest, not the first. |
| **`check_consistency(components[])`** | ⭐ Static design-clash analysis across a mixed set: inconsistent border-radius scales, hardcoded colors vs theme tokens (**with auto-suggested remappings** like `text-zinc-900 → text-foreground`), dark-mode risk (only flags components that hardcode colors *and* lack `dark:` — token-based ones count as dark-capable), arbitrary spacing/font values off the scale, and conflicting icon/animation libs. Findings come with concrete per-component pointers. |

## Connect to Claude Code

**Published (recommended)** — no clone, no build. Add to `.mcp.json` in your
project (or run `claude mcp add ui-registry -- npx -y ui-registry-mcp`):

```json
{
  "mcpServers": {
    "ui-registry": {
      "command": "npx",
      "args": ["-y", "ui-registry-mcp"]
    }
  }
}
```

**From a local clone** (for development):

```json
{
  "mcpServers": {
    "ui-registry": {
      "command": "node",
      "args": ["/absolute/path/to/ui-registry-mcp/dist/index.js"]
    }
  }
}
```

Then just ask, e.g.:

- _"Build a pricing section using components from the registry — compare options across libraries first."_
- _"Add a data table from the registry and check it's design-consistent with the card above."_

The agent will search, (compare,) fetch real source, edit as needed, and run a
consistency pass.

## Local development

```bash
npm install
npm run build
npm test          # full MCP handshake + assertions across all 5 tools
npm run smoke     # hits the registries, prints index sizes + a sample fetch
```

## How it works

- **Live fetch** with a small in-process TTL cache (`UI_REGISTRY_TTL_MS`, default
  5 min) — no maintained local mirror; every value comes from the registry JSON.
- **Resilient**: transient/5xx failures retry with backoff (`UI_REGISTRY_RETRIES`,
  default 2); a single dead registry can't break a cross-library search.
- **Browser-like `User-Agent`** gets past most bot-blocking.
- **Premium components**: some registries list pro/gated components in their index
  that return `401` when fetched (e.g. many reui `stats-*`, `faq-*`, `form-*`,
  bare-named blocks; free examples are usually `c-*`-prefixed). `get_component`
  reports these clearly, and `search_components(..., verified:true)` filters them
  out so the agent only sees installable results.

## Next steps

- Add more registries (Aceternity, Magic UI, Cult UI, …) — one entry each.
- `check_consistency`: a "scan my local project" mode (audit already-installed files).
- Embedding-based search (beyond the curated synonym list) for fuzzier intents.
