/**
 * Full end-to-end coverage of every tool via the real MCP client over stdio.
 * Run after build: node dist/test-client.js
 * Exits non-zero if any check fails.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${extra ? "  -> " + extra : ""}`);
  }
}

const textOf = (res: any): string => (res.content as any[])[0].text;
const jsonOf = (res: any): any => JSON.parse(textOf(res));

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
  });
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(transport);

  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log("\n# Tools registered:", tools.join(", "));
  for (const t of ["list_registries", "search_components", "get_component", "compare_components", "check_consistency"]) {
    check(`tool exists: ${t}`, tools.includes(t));
  }

  // --- list_registries ---
  console.log("\n# list_registries");
  const regs = jsonOf(await client.callTool({ name: "list_registries", arguments: {} }));
  check("returns >= 3 registries", Array.isArray(regs) && regs.length >= 3, JSON.stringify(regs));
  check("includes reui", regs.some((r: any) => r.id === "reui"));
  check("includes kibo", regs.some((r: any) => r.id === "kibo"));

  // --- search_components: ranking regression (table vs sortable) ---
  console.log("\n# search_components 'table' (ranking)");
  const tableHits = jsonOf(await client.callTool({ name: "search_components", arguments: { query: "table", limit: 5 } }));
  console.log("  top:", tableHits.map((h: any) => `${h.registry}/${h.name}(${h.score})`).join(", "));
  const topName: string = tableHits[0]?.name ?? "";
  check("top hit is a real table, not 'sortable'", topName.includes("table") && !topName.includes("sortable"), topName);

  // --- search_components: type filter (ui spans registry:ui + registry:component) ---
  console.log("\n# search_components type filter");
  const uiOnly = jsonOf(await client.callTool({ name: "search_components", arguments: { query: "button", type: "ui", limit: 10 } }));
  const allowed = new Set(["registry:ui", "registry:component"]);
  check("type=ui returns only single-component types (no blocks)",
    uiOnly.length > 0 && uiOnly.every((h: any) => allowed.has(h.type)),
    JSON.stringify(uiOnly.map((h: any) => h.type)));
  const blockOnly = jsonOf(await client.callTool({ name: "search_components", arguments: { query: "button", type: "block", limit: 5 } }));
  check("type=block excludes ui/component", blockOnly.every((h: any) => h.type === "registry:block"));

  // --- search_components: registry scoping ---
  const kokoOnly = jsonOf(await client.callTool({ name: "search_components", arguments: { query: "card", registry: "kokonut", limit: 10 } }));
  check("registry=kokonut scopes results", kokoOnly.length > 0 && kokoOnly.every((h: any) => h.registry === "kokonut"));

  // --- get_component: real source ---
  console.log("\n# get_component");
  const pick = tableHits[0];
  const comp = jsonOf(await client.callTool({ name: "get_component", arguments: { registry: pick.registry, name: pick.name } }));
  check("has install command", typeof comp.installCommand === "string" && comp.installCommand.includes("shadcn"));
  check("returns file(s) with content", Array.isArray(comp.files) && comp.files.length > 0 && comp.files[0].content.length > 50,
    `files=${comp.files?.length}`);

  // --- get_component: bad name errors gracefully ---
  const bad = await client.callTool({ name: "get_component", arguments: { registry: "reui", name: "definitely-not-a-real-component-xyz" } });
  check("unknown component reports an error", (bad as any).isError === true);

  // --- compare_components (a term all libraries have -> real cross-library compare) ---
  console.log("\n# compare_components 'card'");
  const cmp = jsonOf(await client.callTool({ name: "compare_components", arguments: { query: "card" } }));
  console.log("  entries:", cmp.map((e: any) => `${e.registry}/${e.name} (loc=${e.loc})`).join(", "));
  check("compare returns entries with preview + loc", Array.isArray(cmp) && cmp.length >= 1 && typeof cmp[0].preview === "string" && cmp[0].loc > 0);
  check("compare spans multiple libraries", new Set(cmp.map((e: any) => e.registry)).size >= 2,
    `registries=${JSON.stringify(cmp.map((e: any) => e.registry))}`);

  // --- check_consistency: build a genuine cross-library set (one 'card' from each registry) ---
  console.log("\n# check_consistency (cross-library set)");
  const set: any[] = [];
  for (const rid of ["reui", "kokonut", "kibo"]) {
    const hit = jsonOf(await client.callTool({ name: "search_components", arguments: { query: "card", registry: rid, limit: 1 } }))[0];
    if (hit) set.push({ registry: rid, name: hit.name });
  }
  console.log("  set:", set.map((s) => `${s.registry}/${s.name}`).join(", "));
  const report = jsonOf(await client.callTool({ name: "check_consistency", arguments: { components: set } }));
  console.log("  summary:", report.summary);
  console.log("  findings:", report.findings.map((f: any) => `${f.dimension}(${f.severity})`).join(", ") || "none");
  check("analyzed the components", Array.isArray(report.analyzed) && report.analyzed.length === set.length,
    `analyzed=${report.analyzed?.length}/${set.length} missing=${JSON.stringify(report.missing)}`);
  check("findings is an array with valid shape", Array.isArray(report.findings) &&
    report.findings.every((f: any) => f.dimension && f.severity && f.message && f.detail));

  await client.close();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
