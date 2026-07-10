/** Minimal shadcn registry types — only the fields we actually read. */

export interface RegistryFile {
  path: string;
  content?: string;
  type?: string;
  target?: string;
}

export interface RegistryItem {
  name: string;
  type?: string; // registry:ui | registry:block | registry:component | ...
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
  meta?: Record<string, unknown>;
  cssVars?: Record<string, unknown>;
}

export interface RegistryIndex {
  name?: string;
  homepage?: string;
  items: RegistryItem[];
}
