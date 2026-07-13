# Getting listed in MCP directories

Being in these directories is what makes the server discoverable and reads as a
real MCP server rather than a stray npm package. Do them roughly in this order.

## 0. Prerequisites (one-time)

- The npm package must be **published with the `mcpName` field** in
  `package.json` (already added: `io.github.mrityunjay-tiwari/ui-registry-mcp`).
  The official registry verifies ownership by reading that field from the
  published package, so **publish the current version to npm first**:
  ```bash
  npm publish
  ```
- Keep [`server.json`](server.json)'s `version` in sync with `package.json` on
  every release.

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

The canonical one — most other directories index from it.

1. Install the publisher CLI (see the
   [quickstart](https://modelcontextprotocol.io/registry/quickstart) for your
   platform; e.g. `brew install mcp-publisher`, or download from the
   [registry releases](https://github.com/modelcontextprotocol/registry/releases)).
2. From the repo root (where `server.json` lives):
   ```bash
   mcp-publisher login github     # opens GitHub OAuth in the browser
   mcp-publisher publish          # reads server.json and submits
   ```
   GitHub login proves you own the `io.github.mrityunjay-tiwari/*` namespace.
3. Re-run `mcp-publisher publish` after each new version (bump `server.json`
   first).

## 2. GitHub repo topics (free, helps auto-indexers)

On the repo page → the ⚙️ next to "About" → add topics:

```
mcp  mcp-server  model-context-protocol  shadcn  shadcn-ui  ui-components  claude  ai
```

Several directories (Glama, mcp.so, registry.directory) discover servers via the
official registry and/or these topics.

## 3. Awesome MCP Servers (GitHub lists)

Open a small PR adding one line under an appropriate category (e.g. "Developer
Tools" / "UI"):

- [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
- [wong2/awesome-mcp-servers](https://github.com/wong2/awesome-mcp-servers)

Suggested entry:

> **[ui-registry-mcp](https://github.com/mrityunjay-tiwari/ui-registry-mcp)** — Live access to 12 shadcn-style component libraries (~3,700 components) so agents compose UI from real components, compare across libraries, and design-check the result.

## 4. Other directories (optional)

- **registry.directory** — usually picks up from the official registry; you can
  also submit at the site.
- **Smithery** (smithery.ai) — connect the GitHub repo; more geared to hosted
  servers, optional for a local stdio one.
- **mcpservers.org**, **mcp.so**, **Glama** — mostly auto-index once you're in
  the official registry with GitHub topics set.

## Keeping it current

On each release: bump `package.json` and `server.json` to the same version,
`npm publish`, then `mcp-publisher publish`. That's it.
