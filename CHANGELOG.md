# Changelog

All notable changes to `ui-registry-mcp`. This project follows
[semantic versioning](https://semver.org).

## 0.7.0

- New library: **AI Elements** (Vercel) — 77 chat / AI-native components
  (conversation, message, prompt-input, reasoning, tool-call, …), Apache-2.0.
  The first library here aimed at AI/agent UIs.
- Project tooling: GitHub Actions CI (build + test on Node 20/22), README status
  badges, this changelog, `CONTRIBUTING.md`, issue/PR templates, `.editorconfig`,
  and `.nvmrc`.

## 0.6.1

- Rewrote the README in a human voice; grouped the deeper material under an
  "Under the hood" section and added a Feedback & contributing section.
- Fixed a version-drift bug — the server now reports the version from
  `package.json` instead of a hardcoded string.
- Attribution now leads every `get_component` response, and the tool tells the
  agent to relay it to the user.

## 0.6.0

- New tool: **`list_components`** — the full directory of every component across
  all libraries, each with its direct URL. Paginated and filterable.
- **Source attribution** — `get_component` now returns `sourceUrl`, `license`,
  and a ready-to-show `attribution` string so the agent can credit the origin.
- `npm run catalog` script to snapshot the whole directory to `catalog.json`.

## 0.4.0 – 0.5.0

- New libraries: **Watermelon UI, beUI, Optics, useLayouts**.
- Server-level **workflow instructions** that guide the agent through
  understand → discover → compare → fetch → check consistency → attribute.

## 0.3.0

- New library: **Cult UI**.

## 0.2.0

- New libraries: **Aceternity, Tailark, SmoothUI**.
- **`verified` mode** — fetch-checks results and returns only installable
  components, filtering out premium/gated ones that 401.
- **Consistency v2** — fixed the dark-mode false positive (token-based
  components count as dark-capable), added spacing and font-size checks, and
  auto-suggested token remappings (e.g. `text-zinc-900 → text-foreground`).
- **Domain-intent synonyms** — `pricing` reaches `plan`/`tier`/`billing`/etc.
- Per-registry **license and premium/gating notes** surfaced in
  `list_registries`.

## 0.1.0

- Initial release. Five tools: `list_registries`, `search_components`,
  `get_component`, `compare_components`, `check_consistency`.
- Three libraries: **ReUI, Kokonut UI, Kibo UI**.
- Token-ranked, synonym-aware search; live fetch with retry and a short cache;
  published to npm for zero-setup use via `npx`.
