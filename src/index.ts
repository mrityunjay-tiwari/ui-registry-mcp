#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { REGISTRIES, getRegistry, installCommand } from "./registries.js";
import { getItem } from "./fetcher.js";
import { searchComponents } from "./search.js";
import { compareComponents } from "./compare.js";
import { checkConsistency } from "./consistency.js";

const server = new McpServer({
  name: "ui-registry-mcp",
  version: "0.1.0",
});

/**
 * The design intent behind these tools:
 *   list -> discover which libraries exist
 *   search -> find the RIGHT component cheaply (names + one-liners, no source)
 *   get -> pull the REAL source of the winner so the agent can use/edit it
 * Claude decides what to use, when, and what to change. We just hand it material.
 */

server.registerTool(
  "list_registries",
  {
    title: "List component registries",
    description:
      "List the component libraries this server can pull from (id, name, homepage). Call this first to see what is available.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          REGISTRIES.map((r) => ({ id: r.id, name: r.name, homepage: r.homepage })),
          null,
          2,
        ),
      },
    ],
  }),
);

server.registerTool(
  "search_components",
  {
    title: "Search components across libraries",
    description:
      "Search all configured component libraries (or one) for components matching a natural-language query, e.g. 'pricing table', 'date picker', 'sidebar'. Synonym-aware: 'modal' also finds 'dialog', 'dropdown' finds 'select', etc. Returns a ranked, lightweight list (registry, name, type, title, description) — NOT the source. Pick the best match, then call get_component to fetch its real code. Set verified:true to return only components confirmed installable (filters out premium/gated ones that would 401).",
    inputSchema: {
      query: z.string().describe("What you need, e.g. 'pricing table' or 'avatar group'"),
      registry: z
        .string()
        .optional()
        .describe("Optional registry id to restrict the search (see list_registries)"),
      type: z
        .string()
        .optional()
        .describe("Optional type filter: 'ui' (single component), 'block' (composed section), 'component', 'hook'"),
      verified: z
        .boolean()
        .optional()
        .describe("When true, fetch-check results and return only components that are actually installable (drops premium/gated items that would 401). Slower; use when you want guaranteed-installable results."),
      limit: z.number().int().positive().max(50).optional().describe("Max results (default 20)"),
    },
  },
  async ({ query, registry, type, verified, limit }) => {
    const hits = await searchComponents(query, registry, limit ?? 20, type, verified ?? false);
    // Always return a JSON array (possibly empty) so callers can parse uniformly.
    // An empty array means "no matches — try broader terms or list_registries".
    return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
  },
);

server.registerTool(
  "get_component",
  {
    title: "Get a component's real source",
    description:
      "Fetch the full, current source of one component from a specific library: file contents, npm dependencies, registry dependencies, and the exact install command. Use this after search_components. The returned source is real code you can drop into the project and edit freely.",
    inputSchema: {
      registry: z.string().describe("Registry id, e.g. 'reui' (see list_registries)"),
      name: z.string().describe("Component name exactly as returned by search_components"),
    },
  },
  async ({ registry, name }) => {
    const reg = getRegistry(registry);
    if (!reg) {
      return {
        content: [
          { type: "text", text: `Unknown registry "${registry}". Call list_registries.` },
        ],
        isError: true,
      };
    }
    try {
      const item = await getItem(reg, name);
      const payload = {
        registry: reg.id,
        name: item.name,
        type: item.type,
        title: item.title,
        description: item.description,
        dependencies: item.dependencies ?? [],
        registryDependencies: item.registryDependencies ?? [],
        installCommand: installCommand(reg, name),
        files: (item.files ?? []).map((f) => ({
          path: f.path,
          target: f.target,
          type: f.type,
          content: f.content ?? "",
        })),
      };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    } catch (err) {
      const msg = (err as Error).message;
      const gated = /\b(401|403)\b/.test(msg);
      const hint = gated
        ? `This component appears to be premium/gated (not free to install). Re-run search_components with verified:true to get only installable alternatives.`
        : `Confirm the name via search_components.`;
      return {
        content: [
          { type: "text", text: `Failed to fetch "${name}" from ${reg.id}: ${msg}. ${hint}` },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "compare_components",
  {
    title: "Compare a component across libraries",
    description:
      "For a given intent (e.g. 'pricing table', 'date picker'), fetch the single best match from EACH library and return them side by side: dependencies, file count, lines of code, install command, and a source preview. Use this to choose the nicest implementation instead of taking the first search hit.",
    inputSchema: {
      query: z.string().describe("The component intent, e.g. 'pricing table'"),
      registries: z
        .array(z.string())
        .optional()
        .describe("Optional subset of registry ids to compare (default: all)"),
    },
  },
  async ({ query, registries }) => {
    const entries = await compareComponents(query, registries);
    if (entries.length === 0) {
      return { content: [{ type: "text", text: `No comparable matches for "${query}".` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
  },
);

server.registerTool(
  "check_consistency",
  {
    title: "Check design consistency across components",
    description:
      "Given a set of components (from get_component / search results), statically analyze their source for design clashes when mixed together: inconsistent border-radius scales, hardcoded colors vs theme tokens, missing dark-mode variants, and conflicting icon/animation libraries. Returns findings with concrete pointers so you can normalize the UI before shipping. Run this after assembling components from different libraries.",
    inputSchema: {
      components: z
        .array(
          z.object({
            registry: z.string().describe("Registry id, e.g. 'reui'"),
            name: z.string().describe("Component name"),
          }),
        )
        .min(1)
        .describe("The components you plan to use together"),
    },
  },
  async ({ components }) => {
    const report = await checkConsistency(components);
    return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs on stdio transport; stdout is reserved for protocol.
  console.error("ui-registry-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
