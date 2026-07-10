import type { Registry } from "./registries.js";
import { REGISTRIES, getRegistry } from "./registries.js";
import { getIndex } from "./fetcher.js";
import type { RegistryItem } from "./types.js";

export interface SearchHit {
  registry: string; // registry id
  name: string;
  type?: string;
  title?: string;
  description?: string;
  score: number;
}

/** Split a string into lowercased word tokens (drop separators like -, _, space, :). */
export function tokenize(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Strip the "registry:" prefix so callers filter by "ui" | "block" | "component" | "hook". */
const shortType = (t?: string) => (t ?? "").replace(/^registry:/, "");

/**
 * Registries disagree on labels for the same intent: reui/kibo call a single
 * component `registry:ui`, kokonut calls it `registry:component`. Map a caller's
 * filter to the set of concrete types that satisfy it, so type:"ui" spans both.
 */
const TYPE_ALIASES: Record<string, string[]> = {
  ui: ["ui", "component"],
  component: ["ui", "component"],
  block: ["block"],
  hook: ["hook"],
  style: ["style"],
};
const resolveTypes = (filter: string) => TYPE_ALIASES[filter] ?? [filter];

interface Indexed {
  item: RegistryItem;
  nameTokens: string[];
  titleTokens: string[];
  descTokens: string[];
  extraTokens: string[]; // type + meta.group
  nameLower: string;
  titleLower: string;
}

function indexItem(item: RegistryItem): Indexed {
  const group = (item.meta as any)?.group as string | undefined;
  return {
    item,
    nameTokens: tokenize(item.name),
    titleTokens: tokenize(item.title),
    descTokens: tokenize(item.description),
    extraTokens: [...tokenize(shortType(item.type)), ...tokenize(group)],
    nameLower: (item.name ?? "").toLowerCase(),
    titleLower: (item.title ?? "").toLowerCase(),
  };
}

/**
 * Token-aware scoring. The key win over naive substring matching: a query term
 * only scores high when it matches a WHOLE token, so "table" ranks c-table-1
 * far above c-sortable-1 (where "table" is merely a substring of "sortable").
 */
function scoreItem(idx: Indexed, terms: string[], phrase: string): number {
  let score = 0;
  for (const term of terms) {
    let best = 0;
    if (idx.nameTokens.includes(term)) best = Math.max(best, 6);
    else if (idx.nameTokens.some((t) => t.startsWith(term))) best = Math.max(best, 4);

    if (idx.titleTokens.includes(term)) best = Math.max(best, 4);
    else if (idx.titleTokens.some((t) => t.startsWith(term))) best = Math.max(best, 3);

    if (idx.descTokens.includes(term)) best = Math.max(best, 2);
    if (idx.extraTokens.includes(term)) best = Math.max(best, 2);

    // Weak fallback so compound queries still connect (e.g. "datepicker" ~ "date-picker").
    if (best === 0 && (idx.nameLower.includes(term) || idx.titleLower.includes(term))) best = 1;

    score += best;
  }
  // Phrase bonuses: exact intent expressed in title/name.
  if (phrase.length > 2) {
    if (idx.titleLower.includes(phrase)) score += 3;
    if (idx.nameLower.includes(phrase.replace(/\s+/g, "-"))) score += 2;
  }
  return score;
}

/**
 * Lightweight cross-registry ranking. Returns just enough for the agent to PICK
 * a component — not the source. The agent then calls get_component on the winner.
 *
 * @param typeFilter optional short type: "ui" | "block" | "component" | "hook" ...
 */
export async function searchComponents(
  query: string,
  registryId?: string,
  limit = 20,
  typeFilter?: string,
): Promise<SearchHit[]> {
  const targets: Registry[] = registryId
    ? [getRegistry(registryId)].filter((r): r is Registry => Boolean(r))
    : REGISTRIES;

  const terms = tokenize(query);
  const phrase = query.trim().toLowerCase();
  const wantTypes = typeFilter ? resolveTypes(typeFilter.toLowerCase()) : undefined;
  const hits: SearchHit[] = [];

  const indexes = await Promise.allSettled(
    targets.map(async (reg) => ({ reg, index: await getIndex(reg) })),
  );

  for (const result of indexes) {
    if (result.status !== "fulfilled") continue;
    const { reg, index } = result.value;
    for (const item of index.items ?? []) {
      if (wantTypes && !wantTypes.includes(shortType(item.type))) continue;
      const idx = indexItem(item);
      const score = scoreItem(idx, terms, phrase);
      if (score > 0) {
        hits.push({
          registry: reg.id,
          name: item.name,
          type: item.type,
          title: item.title,
          description: item.description || undefined,
          score,
        });
      }
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
