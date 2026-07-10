import { REGISTRIES, getRegistry, installCommand } from "./registries.js";
import { getItem } from "./fetcher.js";
import { searchComponents } from "./search.js";
import type { RegistryItem } from "./types.js";

export interface CompareEntry {
  registry: string;
  name: string;
  title?: string;
  type?: string;
  dependencies: string[];
  registryDependencies: string[];
  fileCount: number;
  loc: number;
  installCommand: string;
  preview: string; // first ~40 lines of the primary file
}

const loc = (item: RegistryItem) =>
  (item.files ?? []).reduce((n, f) => n + (f.content?.split("\n").length ?? 0), 0);

function preview(item: RegistryItem): string {
  const primary = (item.files ?? []).find((f) => f.content)?.content ?? "";
  return primary.split("\n").slice(0, 40).join("\n");
}

/**
 * Take the single best match for `query` from EACH registry (or a chosen subset)
 * and fetch its real details, so the agent can compare like-for-like and choose
 * the nicest implementation instead of just the first hit.
 */
export async function compareComponents(
  query: string,
  registryIds?: string[],
): Promise<CompareEntry[]> {
  const targets = (registryIds?.length
    ? registryIds.map(getRegistry).filter(Boolean)
    : REGISTRIES) as NonNullable<ReturnType<typeof getRegistry>>[];

  const entries = await Promise.allSettled(
    targets.map(async (reg) => {
      const [top] = await searchComponents(query, reg.id, 1);
      if (!top) return null;
      const item = await getItem(reg, top.name);
      const entry: CompareEntry = {
        registry: reg.id,
        name: item.name,
        title: item.title,
        type: item.type,
        dependencies: item.dependencies ?? [],
        registryDependencies: item.registryDependencies ?? [],
        fileCount: (item.files ?? []).length,
        loc: loc(item),
        installCommand: installCommand(reg, item.name),
        preview: preview(item),
      };
      return entry;
    }),
  );

  return entries
    .filter((r): r is PromiseFulfilledResult<CompareEntry | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((e): e is CompareEntry => e !== null);
}
