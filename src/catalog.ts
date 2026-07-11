import type { Registry } from "./registries.js";
import { REGISTRIES, getRegistry, componentUrl, installCommand } from "./registries.js";
import { getIndex } from "./fetcher.js";

export interface CatalogEntry {
  registry: string; // registry id
  registryName: string;
  name: string;
  type?: string;
  title?: string;
  /** Direct URL to the component's registry JSON (also the shadcn install URL). */
  url: string;
  installCommand: string;
  homepage: string;
}

const shortType = (t?: string) => (t ?? "").replace(/^registry:/, "");

/**
 * The full component directory across libraries, each with its DIRECT URL.
 * Paginated because the catalog is thousands of entries — never dump it all
 * into one response by default.
 */
export async function listComponents(opts: {
  registry?: string;
  type?: string;
  offset?: number;
  limit?: number;
}): Promise<{ total: number; offset: number; count: number; components: CatalogEntry[] }> {
  const targets: Registry[] = opts.registry
    ? [getRegistry(opts.registry)].filter((r): r is Registry => Boolean(r))
    : REGISTRIES;
  const wantType = opts.type ? opts.type.toLowerCase() : undefined;

  const all: CatalogEntry[] = [];
  const indexes = await Promise.allSettled(
    targets.map(async (reg) => ({ reg, index: await getIndex(reg) })),
  );
  for (const r of indexes) {
    if (r.status !== "fulfilled") continue;
    const { reg, index } = r.value;
    for (const it of index.items ?? []) {
      if (wantType && shortType(it.type) !== wantType) continue;
      all.push({
        registry: reg.id,
        registryName: reg.name,
        name: it.name,
        type: it.type,
        title: it.title,
        url: componentUrl(reg, it.name),
        installCommand: installCommand(reg, it.name),
        homepage: reg.homepage,
      });
    }
  }

  const total = all.length;
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000);
  const components = all.slice(offset, offset + limit);
  return { total, offset, count: components.length, components };
}
