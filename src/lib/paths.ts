import { isAbsolute, relative } from "node:path"

export function toDisplayPath(absPath: string, cwd: string): string {
  const rel = relative(cwd, absPath)
  if (rel.startsWith("..") || isAbsolute(rel)) return absPath
  return rel || "."
}
