import type { Registry } from "./registries.js";
import { REGISTRIES, getRegistry } from "./registries.js";
import { getIndex, isAvailable } from "./fetcher.js";
import type { RegistryItem } from "./types.js";

export interface SearchHit {
  registry: string; // registry id
  name: string;
  type?: string;
  title?: string;
  description?: string;
  score: number;
  /** Set only in verified mode: confirmed fetchable/installable (not premium-gated). */
  available?: boolean;
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

/**
 * UI-concept synonyms. Agents phrase requests differently from how libraries
 * name components ("modal" vs "dialog", "dropdown" vs "select"). We expand each
 * query term with its group so the right component surfaces regardless of
 * wording. Synonym matches score LOWER than direct matches (see scoreItem), so
 * an exact hit always ranks above a synonym hit.
 */
const SYNONYM_GROUPS: string[][] = [
  ["modal", "dialog", "popup", "overlay", "lightbox"],
  ["dropdown", "select", "combobox", "listbox"],
  ["menu", "dropdownmenu", "contextmenu"],
  ["toast", "notification", "snackbar", "sonner"],
  ["alert", "banner", "callout", "announcement"],
  ["accordion", "collapsible", "disclosure"],
  ["tooltip", "hint"],
  ["popover", "flyout"],
  ["carousel", "gallery", "slideshow"],
  ["spinner", "loader", "loading"],
  ["skeleton", "placeholder", "shimmer"],
  ["switch", "toggle"],
  ["badge", "chip", "tag", "pill"],
  ["avatar", "profile"],
  ["datepicker", "calendar", "datefield"],
  ["table", "datatable", "datagrid"],
  ["input", "textfield", "textbox", "field"],
  ["navbar", "navigation", "nav", "menubar"],
  ["sidebar", "drawer", "sheet"],
  ["breadcrumb", "breadcrumbs"],
  ["pagination", "pager"],
  ["rating", "stars"],
  ["chart", "graph"],
  ["button", "btn", "cta"],
  ["stepper", "steps", "wizard"],
  ["slider", "range"],
  ["kanban", "board"],
  // Domain / page-section intents — how libraries actually name marketing and
  // app sections. Lets "pricing" reach a "subscription" or "tier" component, etc.
  ["pricing", "plan", "plans", "tier", "tiers", "billing", "subscription", "subscriptions", "upgrade"],
  ["stats", "stat", "metric", "metrics", "kpi", "analytics"],
  ["dashboard", "admin", "overview", "console"],
  ["testimonial", "testimonials", "review", "reviews", "quote"],
  ["hero", "landing", "banner", "jumbotron"],
  ["auth", "login", "signin", "signup", "register", "authentication"],
  ["checkout", "cart", "payment", "basket"],
  ["profile", "account", "settings", "preferences"],
  ["faq", "faqs", "questions"],
  ["feature", "features", "benefits"],
  ["team", "members", "people", "staff"],
  ["contact", "enquiry", "support"],
  ["gallery", "portfolio", "showcase"],
];

const SYNONYMS: Map<string, string[]> = (() => {
  const m = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      if (!m.has(word)) m.set(word, new Set());
      for (const other of group) if (other !== word) m.get(word)!.add(other);
    }
  }
  return new Map([...m].map(([k, v]) => [k, [...v]]));
})();

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

/** Best score (0..6) for a single term against one item's fields. */
function termBest(idx: Indexed, term: string): number {
  let best = 0;
  if (idx.nameTokens.includes(term)) best = Math.max(best, 6);
  else if (idx.nameTokens.some((t) => t.startsWith(term))) best = Math.max(best, 4);

  if (idx.titleTokens.includes(term)) best = Math.max(best, 4);
  else if (idx.titleTokens.some((t) => t.startsWith(term))) best = Math.max(best, 3);

  if (idx.descTokens.includes(term)) best = Math.max(best, 2);
  if (idx.extraTokens.includes(term)) best = Math.max(best, 2);

  // Weak fallback so compound queries still connect (e.g. "datepicker" ~ "date-picker").
  if (best === 0 && (idx.nameLower.includes(term) || idx.titleLower.includes(term))) best = 1;
  return best;
}

/** Cap on how much a synonym match can contribute — always below a direct hit. */
const SYNONYM_CAP = 3;

/**
 * Token-aware scoring with synonym expansion. The key win over naive substring
 * matching: a query term only scores high when it matches a WHOLE token, so
 * "table" ranks c-table-1 far above c-sortable-1. Each term also matches its
 * synonyms, but capped so an exact hit always outranks a synonym hit.
 */
function scoreItem(idx: Indexed, expanded: ExpandedTerm[], phrase: string): number {
  let score = 0;
  for (const { primary, syns } of expanded) {
    let s = termBest(idx, primary);
    if (s === 0 && syns.length) {
      let synBest = 0;
      for (const syn of syns) synBest = Math.max(synBest, termBest(idx, syn));
      s = Math.min(synBest, SYNONYM_CAP);
    }
    score += s;
  }
  // Phrase bonuses: exact intent expressed in title/name.
  if (phrase.length > 2) {
    if (idx.titleLower.includes(phrase)) score += 3;
    if (idx.nameLower.includes(phrase.replace(/\s+/g, "-"))) score += 2;
  }
  return score;
}

interface ExpandedTerm {
  primary: string;
  syns: string[];
}

/**
 * Lightweight cross-registry ranking. Returns just enough for the agent to PICK
 * a component — not the source. The agent then calls get_component on the winner.
 *
 * @param typeFilter optional short type: "ui" | "block" | "component" | "hook" ...
 * @param verified  when true, fetch-check ranked hits and return only ones that
 *                  are actually installable (drops premium/401-gated items).
 */
export async function searchComponents(
  query: string,
  registryId?: string,
  limit = 20,
  typeFilter?: string,
  verified = false,
): Promise<SearchHit[]> {
  const targets: Registry[] = registryId
    ? [getRegistry(registryId)].filter((r): r is Registry => Boolean(r))
    : REGISTRIES;

  const terms = tokenize(query);
  const expanded: ExpandedTerm[] = terms.map((t) => ({ primary: t, syns: SYNONYMS.get(t) ?? [] }));
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
      const score = scoreItem(idx, expanded, phrase);
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

  const ranked = hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  if (!verified) return ranked.slice(0, limit);
  return verifyHits(ranked, limit);
}

/** Max fetch-checks a verified search will make before giving up (cost guard). */
const VERIFY_CAP = 40;
/** How many availability checks run concurrently. */
const VERIFY_CONCURRENCY = 8;

/**
 * Walk ranked hits top-down, checking installability in small concurrent
 * batches, until we have `limit` confirmed-available hits or hit VERIFY_CAP.
 * Gated (premium/401) hits are dropped; survivors are marked available:true.
 */
async function verifyHits(ranked: SearchHit[], limit: number): Promise<SearchHit[]> {
  const available: SearchHit[] = [];
  let checked = 0;

  for (let i = 0; i < ranked.length && available.length < limit && checked < VERIFY_CAP; ) {
    const batch = ranked.slice(i, i + VERIFY_CONCURRENCY);
    i += batch.length;
    checked += batch.length;
    const results = await Promise.all(
      batch.map(async (hit) => {
        const reg = getRegistry(hit.registry);
        const ok = reg ? await isAvailable(reg, hit.name) : false;
        return ok ? { ...hit, available: true } : null;
      }),
    );
    for (const r of results) {
      if (r && available.length < limit) available.push(r);
    }
  }
  return available;
}
