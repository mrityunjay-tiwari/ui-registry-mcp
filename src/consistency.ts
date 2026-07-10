import { getRegistry } from "./registries.js";
import { getItem } from "./fetcher.js";
import type { RegistryItem } from "./types.js";

/**
 * Static design-consistency analysis — the real UX-polish edge.
 *
 * When an agent mixes components from different libraries, subtle clashes creep
 * in: one uses `rounded-xl`, another `rounded-md`; one themes with `bg-primary`,
 * another hardcodes `bg-blue-600`; one ships dark-mode variants, another doesn't.
 * We scan the actual source (Tailwind classes + deps) and surface those clashes
 * with concrete pointers so the agent can normalize before shipping.
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
}

export interface ConsistencyReport {
  analyzed: string[]; // component keys actually fetched
  missing: string[]; // refs that failed to fetch
  findings: Finding[];
  summary: string;
}

const THEME_TOKENS =
  "primary|secondary|muted|accent|destructive|foreground|background|card|popover|border|input|ring";
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_PREFIX = "bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|decoration";

const RE = {
  radius: new RegExp(`\\brounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?\\b`, "g"),
  hardcoded: new RegExp(`\\b(?:${COLOR_PREFIX})-(?:${PALETTE})-\\d{2,3}\\b`, "g"),
  hex: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,
  themeToken: new RegExp(`\\b(?:${COLOR_PREFIX})-(?:${THEME_TOKENS})\\b`, "g"),
  dark: /\bdark:/g,
};

const ICON_LIBS = ["lucide-react", "@radix-ui/react-icons", "react-icons", "@tabler/icons-react", "@heroicons/react"];
const ANIM_LIBS = ["framer-motion", "motion", "gsap", "@react-spring/web", "auto-animate", "@formkit/auto-animate"];

const key = (r: ComponentRef) => `${r.registry}/${r.name}`;
const uniq = (a: string[]) => [...new Set(a)];
const matches = (src: string, re: RegExp) => uniq(src.match(re) ?? []);

interface Scanned {
  key: string;
  source: string;
  deps: string[];
  radius: string[];
  hardcoded: string[];
  hex: string[];
  themeTokens: string[];
  hasDark: boolean;
}

function scan(k: string, item: RegistryItem): Scanned {
  const source = (item.files ?? []).map((f) => f.content ?? "").join("\n");
  return {
    key: k,
    source,
    deps: item.dependencies ?? [],
    radius: matches(source, RE.radius),
    hardcoded: matches(source, RE.hardcoded),
    hex: matches(source, RE.hex),
    themeTokens: matches(source, RE.themeToken),
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

  // 2) Hardcoded palette colors instead of theme tokens — breaks theming/dark mode.
  const hardcoders = scanned.filter((s) => s.hardcoded.length || s.hex.length);
  if (hardcoders.length) {
    findings.push({
      dimension: "color-tokens",
      severity: "warn",
      message:
        "Hardcoded colors found (palette classes / hex) instead of theme tokens like bg-primary, text-foreground. Map these to tokens so theme + dark mode stay consistent.",
      detail: Object.fromEntries(
        hardcoders.map((s) => [s.key, uniq([...s.hardcoded, ...s.hex])]),
      ),
    });
  }

  // 3) Dark-mode coverage: some components themed for dark, others not.
  const withDark = scanned.filter((s) => s.hasDark).map((s) => s.key);
  const withoutDark = scanned.filter((s) => !s.hasDark).map((s) => s.key);
  if (withDark.length && withoutDark.length) {
    findings.push({
      dimension: "dark-mode",
      severity: "warn",
      message: "Some components ship dark: variants and others don't — mixing them will look broken in dark mode.",
      detail: { hasDarkVariants: withDark, missingDarkVariants: withoutDark },
    });
  }

  // 4) Conflicting icon / animation libraries pulled in by different components.
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
