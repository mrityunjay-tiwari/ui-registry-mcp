import type { Registry } from "./registries.js";
import { indexUrl, componentUrl } from "./registries.js";
import type { RegistryIndex, RegistryItem } from "./types.js";

/**
 * Live fetch layer with a small in-process TTL cache.
 *
 * The user asked for LIVE registry data (no maintained local mirror). We honor
 * that — every value here comes straight from the registry's own JSON. The TTL
 * cache only avoids re-downloading the same file multiple times inside a single
 * short-lived agent turn; it is not a persistent index.
 */

const TTL_MS = Number(process.env.UI_REGISTRY_TTL_MS ?? 5 * 60 * 1000);
const USER_AGENT =
  "ui-registry-mcp/0.1 (+https://modelcontextprotocol.io) Mozilla/5.0 (compatible)";

interface CacheEntry<T> {
  value: T;
  expires: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

const RETRIES = Number(process.env.UI_REGISTRY_RETRIES ?? 2);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value as T;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(200 * attempt); // linear backoff on transient failures
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (!res.ok) {
        // 4xx is a real error (wrong name/path) — don't waste retries on it.
        if (res.status >= 400 && res.status < 500) {
          throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
        }
        lastErr = new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
        continue;
      }
      const value = (await res.json()) as T;
      cache.set(url, { value, expires: Date.now() + TTL_MS });
      return value;
    } catch (err) {
      lastErr = err;
      // Network-level failures ("fetch failed") are worth retrying; 4xx above is not.
      if (err instanceof Error && /Fetch failed 4\d\d/.test(err.message)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Fetch failed for ${url}`);
}

export async function getIndex(reg: Registry): Promise<RegistryIndex> {
  return fetchJson<RegistryIndex>(indexUrl(reg));
}

export async function getItem(reg: Registry, name: string): Promise<RegistryItem> {
  return fetchJson<RegistryItem>(componentUrl(reg, name));
}
