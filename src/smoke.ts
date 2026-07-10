/**
 * Quick live check of the fetch/search layer (no MCP client needed).
 * Run: npm run smoke
 */
import { REGISTRIES } from "./registries.js";
import { getIndex, getItem } from "./fetcher.js";
import { searchComponents } from "./search.js";

async function main() {
  console.log("Registries:", REGISTRIES.map((r) => r.id).join(", "), "\n");

  for (const reg of REGISTRIES) {
    try {
      const idx = await getIndex(reg);
      console.log(`[${reg.id}] index OK — ${idx.items?.length ?? 0} items`);
    } catch (e) {
      console.log(`[${reg.id}] index FAILED — ${(e as Error).message}`);
    }
  }

  console.log("\nsearch 'table':");
  const hits = await searchComponents("table", undefined, 8);
  for (const h of hits) console.log(`  ${h.registry}/${h.name} (${h.type}) — score ${h.score}`);

  if (hits[0]) {
    const first = hits[0];
    console.log(`\nget_component ${first.registry}/${first.name}:`);
    const item = await getItem(REGISTRIES.find((r) => r.id === first.registry)!, first.name);
    console.log(`  files: ${(item.files ?? []).length}, deps: ${(item.dependencies ?? []).join(", ") || "none"}`);
    const firstFile = item.files?.[0];
    if (firstFile) {
      console.log(`  first file: ${firstFile.path} (${(firstFile.content ?? "").length} chars)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
