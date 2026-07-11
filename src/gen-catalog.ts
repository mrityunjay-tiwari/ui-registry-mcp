/**
 * Generate a static snapshot of the full component directory.
 * Run: npm run catalog  ->  writes catalog.json (every component + direct URL).
 *
 * This is an on-demand SNAPSHOT (registries change over time); the live source of
 * truth is the list_components tool. catalog.json is gitignored on purpose.
 */
import { writeFileSync } from "node:fs";
import { REGISTRIES, componentUrl, installCommand } from "./registries.js";
import { getIndex } from "./fetcher.js";

async function main() {
  const catalog: Array<Record<string, unknown>> = [];
  const perRegistry: Record<string, number> = {};

  for (const reg of REGISTRIES) {
    try {
      const index = await getIndex(reg);
      const items = index.items ?? [];
      perRegistry[reg.id] = items.length;
      for (const it of items) {
        catalog.push({
          registry: reg.id,
          registryName: reg.name,
          name: it.name,
          type: it.type,
          title: it.title,
          url: componentUrl(reg, it.name),
          installCommand: installCommand(reg, it.name),
          homepage: reg.homepage,
          license: reg.license,
        });
      }
      console.error(`[${reg.id}] ${items.length}`);
    } catch (e) {
      console.error(`[${reg.id}] FAILED — ${(e as Error).message}`);
    }
  }

  const out = { generatedFrom: REGISTRIES.map((r) => r.id), perRegistry, total: catalog.length, components: catalog };
  writeFileSync("catalog.json", JSON.stringify(out, null, 2));
  console.error(`\nWrote catalog.json — ${catalog.length} components across ${Object.keys(perRegistry).length} libraries.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
