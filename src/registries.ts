/**
 * Registry configuration.
 *
 * Every entry is a shadcn-style registry: an index at `${base}/registry.json`
 * and one JSON file per component at `${base}/{name}.json` containing the real
 * source (files[].content), dependencies and install metadata.
 *
 * To add a library, drop another entry here — nothing else needs to change.
 * If a registry bot-blocks plain requests, the browser-like User-Agent in
 * fetcher.ts is usually enough to get through.
 */
export interface Registry {
  /** Short id the agent uses, e.g. "reui". */
  id: string;
  /** Human-facing name. */
  name: string;
  /** Base URL for registry files, no trailing slash. */
  base: string;
  /** Homepage / docs, surfaced to the agent for context. */
  homepage: string;
  /** SPDX-ish license of the free components we serve. */
  license: string;
  /** Optional heads-up surfaced in list_registries (e.g. premium gating). */
  notes?: string;
}

export const REGISTRIES: Registry[] = [
  {
    id: "reui",
    name: "ReUI",
    base: "https://reui.io/r",
    homepage: "https://reui.io",
    license: "MIT (free components)",
    notes: "Has premium/pro blocks that 401 on fetch (often bare-named like stats-*, faq-*; free ones are usually c-*-prefixed). Use verified:true for installable results only.",
  },
  {
    id: "kokonut",
    name: "Kokonut UI",
    base: "https://kokonutui.com/r",
    homepage: "https://kokonutui.com",
    license: "MIT",
  },
  {
    id: "kibo",
    name: "Kibo UI",
    base: "https://www.kibo-ui.com/r",
    homepage: "https://www.kibo-ui.com",
    license: "MIT",
  },
  {
    id: "tailark",
    name: "Tailark",
    base: "https://tailark.com/r",
    homepage: "https://tailark.com",
    // This is the free, MIT, open-source registry (github.com/tailark/blocks).
    // Tailark Pro / Quartz is a separate paid product on pro.tailark.com that
    // we intentionally do NOT pull from.
    license: "MIT (free blocks; Tailark Pro is a separate paid product not served here)",
  },
  {
    id: "smoothui",
    name: "SmoothUI",
    base: "https://smoothui.dev/r",
    homepage: "https://smoothui.dev",
    license: "MIT",
  },
  {
    id: "cult-ui",
    name: "Cult UI",
    base: "https://www.cult-ui.com/r",
    homepage: "https://www.cult-ui.com",
    license: "MIT (all 157 components free)",
  },
  {
    id: "uselayouts",
    name: "useLayouts",
    base: "https://uselayouts.com/r",
    homepage: "https://uselayouts.com",
    license: "MIT (100% free, no paid tier)",
  },
  {
    id: "optics",
    name: "Optics",
    base: "https://optics.agusmayol.com.ar/r",
    homepage: "https://optics.agusmayol.com.ar",
    license: "MIT (all free)",
    notes: "Built on Base UI primitives (not Radix), Tailwind v4. Index includes a few registry:lib / registry:file utility items alongside components.",
  },
  {
    id: "watermelon",
    name: "Watermelon UI",
    base: "https://registry.watermelon.sh/r",
    homepage: "https://ui.watermelon.sh",
    license: "MIT (all free)",
    notes: "Very large (~1066 components), React 19 + Tailwind v4 + Radix. Includes many web3/DeFi-specific components (swap widgets, wallet UIs) alongside general ones.",
  },
  {
    id: "beui",
    name: "beUI",
    base: "https://beui.dev/r",
    homepage: "https://beui.dev",
    license: "MIT (all free)",
    notes: "Motion toolkit (Framer Motion) for React/Next. Some components ship multiple files.",
  },
  {
    id: "ai-elements",
    name: "AI Elements (Vercel)",
    base: "https://registry.ai-sdk.dev",
    homepage: "https://elements.ai-sdk.dev",
    license: "Apache-2.0 (all free; keep the license notice when shipping)",
    notes: "Vercel's AI-native components built on shadcn — conversation, message, prompt-input, reasoning, tool-call, code-block, etc. The only library here aimed at chat/agent UIs.",
  },
  {
    // Note: aceternity serves its index at /registry/registry.json and components
    // at /registry/{name}.json, so the base is the "/registry" path (not "/r").
    id: "aceternity",
    name: "Aceternity UI",
    base: "https://ui.aceternity.com/registry",
    homepage: "https://ui.aceternity.com",
    license: "MIT (free components); Aceternity Pro is paid",
    notes: "Only ~116 of 270 listed components are free; the other ~154 are Pro-gated and 401 on fetch. Strongly prefer verified:true so only free, installable components are returned.",
  },
  // --- Probed but NOT enabled (no fetchable static JSON registry) ---
  // Origin UI: originui.com serves an HTML app page (Vercel deployment protection)
  //   for every /r/*.json path instead of registry JSON.
  // PatternCraft: patterncraft.fun serves an HTML SPA (window.onload=...) for every
  //   path including /r/{name}.json — no static registry endpoint.
  // Motion Primitives: motion-primitives.com returns 429 (rate-limited) with an
  //   Astro HTML page on every registry path — no accessible JSON registry.
  // Badtz UI: badtz-ui.com serves per-component JSON (/r/{name}.json works) but
  //   exposes NO registry.json index, so we can't enumerate/search it. Revisit if
  //   they publish an index.
  // Hostinger Horizon: no locatable shadcn registry endpoint found.
  // Vengeance UI (vengenceui.com): components work, but registry.json is a bare
  //   numeric-keyed object (not {items:[]}) AND the license is unverified. Would
  //   need index normalization + license confirmation before enabling.
  // Kairo UI: no locatable shadcn registry endpoint found.
  // "studio": ambiguous name, no single clear registry identified.
  // Revisit any of these if they publish a real JSON registry / CDN mirror.
];

export function getRegistry(id: string): Registry | undefined {
  return REGISTRIES.find((r) => r.id === id);
}

export const indexUrl = (r: Registry) => `${r.base}/registry.json`;
export const componentUrl = (r: Registry, name: string) => `${r.base}/${name}.json`;
export const installCommand = (r: Registry, name: string) =>
  `npx shadcn@latest add ${componentUrl(r, name)}`;
