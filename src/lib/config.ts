import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function locateConfigFile(cwd: string): string | null {
  let dir = resolve(cwd);

  for (; ;) {
    try {
      const candidate = join(dir, ".mcm.json");
      if (existsSync(candidate)) return candidate;
    } catch {
      return null;
    }

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
