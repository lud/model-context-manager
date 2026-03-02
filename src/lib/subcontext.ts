import { readdirSync } from "node:fs"

export function listSubcontexts(subcontextsAbsDir: string): string[] {
  try {
    return readdirSync(subcontextsAbsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

export type ResolveError =
  | { error: "not-found" }
  | { error: "multiple"; names: string[] }

export function resolveSubcontextArg(
  subcontextsAbsDir: string,
  arg: string,
): string | ResolveError {
  const dirs = listSubcontexts(subcontextsAbsDir)
  const num = Number(arg)
  if (!Number.isNaN(num) && Number.isInteger(num) && num > 0) {
    const match = dirs.find((d) => {
      const prefix = d.split(".")[0]
      return Number(prefix) === num
    })
    if (match) return match
    return { error: "not-found" }
  }

  const stripped = arg.replace(/\s+/g, "")
  const pattern = new RegExp(
    ".*" + stripped.split("").map(escapeRegex).join(".*") + ".*",
    "i",
  )
  const matches = dirs.filter((d) => pattern.test(d))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) return { error: "not-found" }
  return { error: "multiple", names: matches }
}

function escapeRegex(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function nextSubcontextDirName(
  existingDirs: string[],
  slug: string,
): string {
  let maxNum = 0
  for (const dir of existingDirs) {
    const prefix = dir.split(".")[0]
    const n = Number(prefix)
    if (!Number.isNaN(n) && n > maxNum) maxNum = n
  }
  const next = String(maxNum + 1).padStart(3, "0")
  return `${next}.${slug}`
}
