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
}

export const REGISTRIES: Registry[] = [
  {
    id: "reui",
    name: "ReUI",
    base: "https://reui.io/r",
    homepage: "https://reui.io",
  },
  {
    id: "kokonut",
    name: "Kokonut UI",
    base: "https://kokonutui.com/r",
    homepage: "https://kokonutui.com",
  },
  {
    id: "kibo",
    name: "Kibo UI",
    base: "https://www.kibo-ui.com/r",
    homepage: "https://www.kibo-ui.com",
  },
  // Origin UI is intentionally NOT enabled: originui.com serves an HTML app page
  // (Vercel deployment protection, data-dpl-id) for every /r/*.json path instead
  // of registry JSON, so there is no public static endpoint to fetch. Revisit if
  // they publish a JSON registry or a CDN mirror.
  // { id: "origin", name: "Origin UI", base: "https://originui.com/r", homepage: "https://originui.com" },
];

export function getRegistry(id: string): Registry | undefined {
  return REGISTRIES.find((r) => r.id === id);
}

export const indexUrl = (r: Registry) => `${r.base}/registry.json`;
export const componentUrl = (r: Registry, name: string) => `${r.base}/${name}.json`;
export const installCommand = (r: Registry, name: string) =>
  `npx shadcn@latest add ${componentUrl(r, name)}`;
