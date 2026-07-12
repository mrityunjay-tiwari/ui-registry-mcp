# Contributing

Thanks for wanting to help — this project gets better every time someone uses it
and tells me what's missing.

## Local setup

```bash
git clone https://github.com/mrityunjay-tiwari/ui-registry-mcp
cd ui-registry-mcp
npm install
npm run build
npm test          # spins up the server and exercises every tool end-to-end
```

`npm test` connects a real MCP client to the server over stdio and checks every
tool against the live registries, so a green run means the whole thing actually
works — not just that it compiles.

## Adding a component library

This is the most common contribution and it's usually tiny. A library qualifies
if it exposes a standard shadcn registry: an index at `{base}/registry.json`
listing items, and one JSON file per component at `{base}/{name}.json`.

1. Confirm it works — the index returns `{ items: [...] }` and a component URL
   returns real source. A browser-like `User-Agent` (already sent) gets past most
   bot protection.
2. Add one entry to [`src/registries.ts`](src/registries.ts) with `id`, `name`,
   `base`, `homepage`, and `license`. Add a `notes` line if it has
   premium/gated components.
3. `npm run smoke` to confirm the index loads, then `npm test`.

If a library only serves per-component JSON (no `registry.json` index) or serves
an HTML app for its registry paths, it can't be enumerated — see the notes at the
bottom of `registries.ts` for examples we've hit.

**Please only add libraries whose free components are openly licensed**, and
prefer ones where the license is clearly stated. Flag any premium/gating in the
`notes` so it surfaces in `list_registries`.

## Other good contributions

- Better consistency checks in [`src/consistency.ts`](src/consistency.ts).
- Search-quality improvements in [`src/search.ts`](src/search.ts).
- Anything on the roadmap in the README (visual previews, semantic search).

## Pull requests

- Keep changes focused; match the surrounding style (it's plain TypeScript, no
  build magic).
- Run `npm test` before opening the PR.
- Describe what changed and why. Screenshots or example tool output help a lot.

Not sure about something? Open an issue first — happy to talk it through.
