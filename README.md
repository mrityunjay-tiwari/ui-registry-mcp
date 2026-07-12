# ui-registry-mcp

[![npm version](https://img.shields.io/npm/v/ui-registry-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/ui-registry-mcp)
[![CI](https://github.com/mrityunjay-tiwari/ui-registry-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/mrityunjay-tiwari/ui-registry-mcp/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/ui-registry-mcp)](https://www.npmjs.com/package/ui-registry-mcp)
[![license: MIT](https://img.shields.io/npm/l/ui-registry-mcp)](LICENSE)

Coding agents are great at logic and not so good at taste. Ask one to build a
pricing page and it'll hand-roll a flat, generic card from memory - when there
are thousands of beautiful, open-source components sitting one
fetch away that too built by people who are great UI/UX experts.

This is an [MCP](https://modelcontextprotocol.io) server that closes that gap.
It plugs into Claude Code, Cursor, Windsurf, or any MCP client and lets the agent
**reach into 12 real component libraries** — search them, pull the actual source,
compare options, and check that everything looks like it belongs together — while
you stay in your editor.

The idea is simple: the agent keeps the judgment (what to use, how to compose,
what to tweak). The libraries keep the craft. This server is just the bridge.

## Quick start

No cloning, no build. Point your MCP client at the published package:

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

(In Claude Code you can also just run `claude mcp add ui-registry -- npx -y ui-registry-mcp`.)

Then ask for UI as:

> "Build a cool pricing section - look across the libraries and pick the best component or tweaking them makes up a great pricing page."
>
> "Add a data table and make sure it matches the card above."

Behind the scenes the agent searches, compares, pulls real code into your
project, and does a quick design-consistency pass before it's done. It'll also
tell you which library each piece came from, so you can credit and inspect the
original.

## What's inside

Twelve libraries, roughly **3,700 components**, all fetched live — so you always
get the current version, never a stale copy.

| Library | Components | Notes |
| --- | --- | --- |
| [ReUI](https://reui.io) | ~1,534 | Huge range; some blocks are paid — the server filters those out |
| [Watermelon UI](https://ui.watermelon.sh) | ~1,066 | Large set, leans web3/DeFi |
| [Aceternity UI](https://ui.aceternity.com) | ~116 free | Animated, 3D, bento; most of its catalog is Pro |
| [Tailark](https://tailark.com) | ~210 | Marketing sections — hero, pricing, testimonials |
| [Cult UI](https://www.cult-ui.com) | ~157 | Design-engineer components with motion |
| [SmoothUI](https://smoothui.dev) | ~107 | Micro-interactions |
| [Optics](https://optics.agusmayol.com.ar) | ~79 | Accessible, built on Base UI |
| [AI Elements](https://elements.ai-sdk.dev) | ~77 | Vercel's chat / AI-native components (Apache-2.0) |
| [beUI](https://beui.dev) | ~64 | Motion toolkit |
| [Kibo UI](https://www.kibo-ui.com) | ~41 | Data-heavy — tables, kanban, gantt |
| [Kokonut UI](https://kokonutui.com) | ~40 | Flashy standalone cards |
| [useLayouts](https://uselayouts.com) | ~26 | Animated layouts |

Everything the server hands you is **openly licensed and free for commercial
use** — MIT across the board, except Vercel's AI Elements, which is Apache-2.0
(keep its license notice when you ship). A couple of libraries (ReUI, Aceternity)
also list *premium* components in their catalog — those quietly fail to install.
You don't have to think about it: ask for `verified` results and the server only
returns things you can actually use. Still, check a library's own license before
you ship.

Adding another library is one entry in [`src/registries.ts`](src/registries.ts)
if it exposes a standard shadcn registry — nothing else changes.

## The tools

Six tools, meant to be used roughly in this order:

- **`list_registries`** — what libraries are available, with their licenses and
  any "heads up, this one has paid components" notes.
- **`search_components`** — describe what you want in plain words. It understands
  synonyms (ask for a "modal", it finds "dialog"), and returns just names and
  one-line descriptions so it never dumps a wall of code into the conversation.
  Add `verified` when you only want components that are actually installable.
- **`compare_components`** — the same idea (say, a "pricing table") pulled from
  every library at once, side by side, so the agent picks the best one instead
  of the first one.
- **`get_component`** — the real source for one component: every file, its
  dependencies, the exact `npx shadcn add` command, and where it came from.
- **`check_consistency`** — the part that makes mixed components feel like one
  design. It reads the actual code and flags the little clashes — one component
  rounds its corners more than another, one hardcodes `zinc-900` where the rest
  use your theme, one forgot dark mode — and suggests the fix for each.
- **`list_components`** — the full directory, every component with its direct
  URL, if you want to browse or link to sources.

---

## Under the hood

If you just want to use it, everything above is enough. What follows is the how
and the why — for the curious, and for anyone thinking about contributing.

### The design decisions

A few choices worth explaining, because they're the difference between a demo
and something you'd actually keep installed:

- **It fetches live instead of mirroring.** These libraries ship updates
  constantly. A cached copy would rot; pulling from each registry's own endpoint
  means you always get today's version. A short in-memory cache keeps it snappy
  within a session.
- **It's honest about paid components.** Rather than let the agent confidently
  pick something that 401s on install, premium items are flagged up front and
  filterable. Nothing worse than an agent that recommends what it can't deliver.
- **Consistency is the real value, not just fetching.** Anyone can wrap a
  registry. The thing that actually makes agent-built UI look designed is
  catching the token/spacing/radius drift when you mix sources — so that's a
  first-class tool, not an afterthought.
- **It gives credit.** Every component comes back with its source URL and a
  ready-to-show attribution line, and the agent is told to pass that on. You
  should always know whose work you're building on.
- **One dead library can't sink a search.** Requests retry on hiccups, and a
  registry being down just drops it from the results instead of failing the
  whole call.

### Local development

```bash
npm install
npm run build
npm test          # spins up the server and exercises every tool end-to-end
npm run smoke      # quick check that all the registries are reachable
npm run catalog    # dump the whole directory to catalog.json
```

### Roadmap — honest about what's next

It's genuinely useful today, but two things would take it further, and both are
real projects rather than quick wins:

- **Visual previews.** You pick UI with your eyes, and right now the agent picks
  from text. The catch: these libraries don't expose preview images
  consistently, so doing this properly means rendering and screenshotting
  components — infrastructure, not a config flag.
- **Meaning-based search.** Search understands synonyms today, but not intent
  like "something friendly for an onboarding screen." Real embeddings would fix
  that.

---

## Feedback & contributing

This exists so an agent can build UI that doesn't look like every other agent's
UI — and it gets better every time someone actually uses it and tells me what
broke or what was missing. If you hit a rough edge, have a feature idea, or know
a library that belongs in here, please
[open an issue](https://github.com/mrityunjay-tiwari/ui-registry-mcp/issues). I
genuinely want to hear it.

Pull requests are very welcome — especially **new registries** (usually a
few-line addition in [`src/registries.ts`](src/registries.ts)) and better
consistency checks. See [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and
[CHANGELOG.md](CHANGELOG.md) for what's changed. If it saved you some time, a ⭐
on the repo means a lot and helps other people find it.

A real thank-you to the teams behind the libraries this stands on — ReUI,
Aceternity, Tailark, Cult UI, SmoothUI, Optics, beUI, Kibo, Kokonut, useLayouts,
Watermelon — and to the shadcn registry ecosystem that makes them all fit
together. This is a bridge to their craft; none of it works without them.

MIT licensed.
