import { getRegistry } from "./registries.js";
import { getItem } from "./fetcher.js";
import type { RegistryItem } from "./types.js";

/**
 * Static design-consistency analysis — the real UX-polish edge.
 *
 * When an agent mixes components from different libraries, subtle clashes creep
 * in: one uses `rounded-xl`, another `rounded-md`; one themes with `bg-primary`,
 * another hardcodes `bg-blue-600`; one adapts to dark mode, another doesn't. We
 * scan the actual source (Tailwind classes + deps) and surface those clashes
 * with concrete pointers — and, for colors, a suggested theme-token remapping —
 * so the agent can normalize before shipping.
 *
 * This is heuristic, not a type-checker: it flags likely-inconsistencies for the
 * agent to judge, it does not "fail" a build.
 */

export interface ComponentRef {
  registry: string;
  name: string;
}

export interface Finding {
  dimension: string;
  severity: "info" | "warn";
  message: string;
  detail: Record<string, string[]>; // component key -> offending values
  /** Only on color findings: hardcoded class -> suggested theme token. */
  suggestions?: Record<string, string>;
}

export interface ConsistencyReport {
  analyzed: string[]; // component keys actually fetched
  missing: string[]; // refs that failed to fetch
  findings: Finding[];
  summary: string;
}

const THEME_TOKENS =
  "primary|secondary|muted|accent|destructive|foreground|background|card|popover|border|input|ring";
const NEUTRALS = "slate|gray|zinc|neutral|stone";
const COLORS =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_PREFIX = "bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|decoration";
const SPACING = "p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y";

const RE = {
  radius: new RegExp(`\\brounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?\\b`, "g"),
  hardcoded: new RegExp(`\\b(?:${COLOR_PREFIX})-(?:${NEUTRALS}|${COLORS})-\\d{2,3}\\b`, "g"),
  hex: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,
  themeToken: new RegExp(`\\b(?:${COLOR_PREFIX})-(?:${THEME_TOKENS})\\b`, "g"),
  dark: /\bdark:/,
  // Arbitrary spacing values escape the Tailwind scale, e.g. p-[13px], gap-[7px].
  spacingArbitrary: new RegExp(`(?<![\\w-])(?:${SPACING})-\\[[^\\]]+\\]`, "g"),
  // Arbitrary font sizes escape the type scale, e.g. text-[13px], text-[1.1rem].
  fontArbitrary: /(?<![\w-])text-\[[0-9.]+(?:px|rem|em)\]/g,
};

const ICON_LIBS = ["lucide-react", "@radix-ui/react-icons", "react-icons", "@tabler/icons-react", "@heroicons/react"];
const ANIM_LIBS = ["framer-motion", "motion", "gsap", "@react-spring/web", "auto-animate", "@formkit/auto-animate"];

const key = (r: ComponentRef) => `${r.registry}/${r.name}`;
const uniq = (a: string[]) => [...new Set(a)];
const matches = (src: string, re: RegExp) => uniq(src.match(re) ?? []);

/** Map a hardcoded color class to the theme token it most likely should be. */
function suggestToken(cls: string): string | undefined {
  const m = /^(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration)-(.+)$/.exec(cls);
  if (!m) return undefined;
  const [, prefix, rest] = m;
  const neutral = new RegExp(`^(?:${NEUTRALS})-(\\d{2,3})$`).exec(rest);
  const colored = new RegExp(`^(?:${COLORS})-\\d{2,3}$`).test(rest);
  const shade = neutral ? Number(neutral[1]) : undefined;

  if (prefix === "bg") {
    if (rest === "white") return "bg-background";
    if (rest === "black") return "bg-foreground";
    if (shade !== undefined) return shade <= 100 ? "bg-muted" : shade >= 800 ? "bg-card" : "bg-muted";
  }
  if (prefix === "text") {
    if (rest === "white" || rest === "black") return "text-foreground";
    if (shade !== undefined) return shade >= 700 ? "text-foreground" : "text-muted-foreground";
  }
  if (["border", "divide", "ring", "outline"].includes(prefix) && shade !== undefined) {
    return `${prefix}-border`;
  }
  if (colored) return `${prefix}-primary (accent — confirm intent)`;
  return undefined;
}

interface Scanned {
  key: string;
  deps: string[];
  radius: string[];
  hardcoded: string[];
  hex: string[];
  themeTokens: string[];
  spacingArbitrary: string[];
  fontArbitrary: string[];
  hasDark: boolean;
}

function scan(k: string, item: RegistryItem): Scanned {
  const source = (item.files ?? []).map((f) => f.content ?? "").join("\n");
  return {
    key: k,
    deps: item.dependencies ?? [],
    radius: matches(source, RE.radius),
    hardcoded: matches(source, RE.hardcoded),
    hex: matches(source, RE.hex),
    themeTokens: matches(source, RE.themeToken),
    spacingArbitrary: matches(source, RE.spacingArbitrary),
    fontArbitrary: matches(source, RE.fontArbitrary),
    hasDark: RE.dark.test(source),
  };
}

export async function checkConsistency(refs: ComponentRef[]): Promise<ConsistencyReport> {
  const scanned: Scanned[] = [];
  const missing: string[] = [];

  await Promise.all(
    refs.map(async (ref) => {
      const reg = getRegistry(ref.registry);
      if (!reg) {
        missing.push(key(ref));
        return;
      }
      try {
        const item = await getItem(reg, ref.name);
        scanned.push(scan(key(ref), item));
      } catch {
        missing.push(key(ref));
      }
    }),
  );

  const findings: Finding[] = [];

  // 1) Border-radius language: more than one radius scale across components reads inconsistent.
  const radiusUnion = uniq(scanned.flatMap((s) => s.radius));
  if (radiusUnion.length > 1 && scanned.length > 1) {
    findings.push({
      dimension: "border-radius",
      severity: "warn",
      message: `Mixed corner rounding across components (${radiusUnion.join(", ")}). Pick one radius scale for a coherent look.`,
      detail: Object.fromEntries(scanned.filter((s) => s.radius.length).map((s) => [s.key, s.radius])),
    });
  }

  // 2) Hardcoded colors instead of theme tokens — with a suggested remapping.
  const hardcoders = scanned.filter((s) => s.hardcoded.length || s.hex.length);
  if (hardcoders.length) {
    const allHardcoded = uniq(hardcoders.flatMap((s) => s.hardcoded));
    const suggestions: Record<string, string> = {};
    for (const cls of allHardcoded) {
      const s = suggestToken(cls);
      if (s) suggestions[cls] = s;
    }
    if (uniq(hardcoders.flatMap((s) => s.hex)).length) {
      suggestions["<hex colors>"] = "replace with a theme token (e.g. text-foreground / bg-card)";
    }
    findings.push({
      dimension: "color-tokens",
      severity: "warn",
      message:
        "Hardcoded colors found (palette classes / hex) instead of theme tokens. Map these to tokens (see suggestions) so theme + dark mode stay consistent.",
      detail: Object.fromEntries(hardcoders.map((s) => [s.key, uniq([...s.hardcoded, ...s.hex])])),
      suggestions,
    });
  }

  // 3) Dark mode: a component is dark-capable if it uses theme tokens OR ships
  //    dark: variants. Only components that HARDCODE colors without dark: will
  //    break in dark mode — those are the real risk (token-based ones adapt via
  //    CSS vars and must NOT be flagged).
  const darkRisk = scanned.filter(
    (s) => !s.hasDark && (s.hardcoded.length > 0 || s.hex.length > 0),
  );
  if (darkRisk.length) {
    findings.push({
      dimension: "dark-mode",
      severity: "warn",
      message:
        "These components hardcode colors and have no dark: variants, so they won't adapt in dark mode. Switch to theme tokens or add dark: variants.",
      detail: Object.fromEntries(darkRisk.map((s) => [s.key, uniq([...s.hardcoded, ...s.hex])])),
    });
  }

  // 4) Arbitrary spacing values that escape the Tailwind scale.
  const spacingOffenders = scanned.filter((s) => s.spacingArbitrary.length);
  if (spacingOffenders.length) {
    findings.push({
      dimension: "spacing-scale",
      severity: "info",
      message:
        "Arbitrary spacing values found (outside the Tailwind spacing scale). Prefer scale steps (p-4, gap-2, …) so spacing stays uniform across components.",
      detail: Object.fromEntries(spacingOffenders.map((s) => [s.key, s.spacingArbitrary])),
    });
  }

  // 5) Arbitrary font sizes that escape the type scale.
  const fontOffenders = scanned.filter((s) => s.fontArbitrary.length);
  if (fontOffenders.length) {
    findings.push({
      dimension: "font-size",
      severity: "info",
      message:
        "Arbitrary font sizes found (outside the type scale). Prefer scale steps (text-sm, text-lg, …) for consistent typography.",
      detail: Object.fromEntries(fontOffenders.map((s) => [s.key, s.fontArbitrary])),
    });
  }

  // 6) Conflicting icon / animation libraries pulled in by different components.
  const allDeps = uniq(scanned.flatMap((s) => s.deps));
  const iconsUsed = ICON_LIBS.filter((l) => allDeps.includes(l));
  const animUsed = ANIM_LIBS.filter((l) => allDeps.includes(l));
  if (iconsUsed.length > 1) {
    findings.push({
      dimension: "icon-libraries",
      severity: "info",
      message: `Multiple icon libraries pulled in (${iconsUsed.join(", ")}). Standardize on one to cut bundle size and keep icon style uniform.`,
      detail: Object.fromEntries(
        scanned.filter((s) => s.deps.some((d) => iconsUsed.includes(d))).map((s) => [s.key, s.deps.filter((d) => iconsUsed.includes(d))]),
      ),
    });
  }
  if (animUsed.length > 1) {
    findings.push({
      dimension: "animation-libraries",
      severity: "warn",
      message: `Multiple animation libraries pulled in (${animUsed.join(", ")}). These often conflict — pick one.`,
      detail: Object.fromEntries(
        scanned.filter((s) => s.deps.some((d) => animUsed.includes(d))).map((s) => [s.key, s.deps.filter((d) => animUsed.includes(d))]),
      ),
    });
  }

  const analyzed = scanned.map((s) => s.key);
  const summary =
    findings.length === 0
      ? `Analyzed ${analyzed.length} component(s): no consistency clashes detected.`
      : `Analyzed ${analyzed.length} component(s): ${findings.length} potential clash(es) across ${uniq(findings.map((f) => f.dimension)).join(", ")}.`;

  return { analyzed, missing, findings, summary };
}
