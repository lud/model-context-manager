import { readdirSync } from "node:fs"
import { basename } from "node:path"
import type { DoctypeFileEntry } from "./project.js"

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

/**
 * For each subdirectory in subcontextAbsDir, look for an eponymous .md file
 * (dirName + ".md") inside it. Returns DoctypeFileEntry[] where each entry
 * has files containing at most the brief filename.
 */
export function listBriefFiles(subcontextAbsDir: string): DoctypeFileEntry[] {
  const subDirs = listSubcontexts(subcontextAbsDir)
  const result: DoctypeFileEntry[] = []
  for (const subDir of subDirs) {
    const briefName = `${subDir}.md`
    const dirPath = `${subcontextAbsDir}/${subDir}`
    let files: string[] = []
    try {
      const entries = readdirSync(dirPath)
      if (entries.includes(briefName)) {
        files = [briefName]
      }
    } catch {
      // missing dir — no brief
    }
    result.push({ dir: dirPath, files })
  }
  return result
}

/**
 * Detect mismatches between subcontext directory slugs and their brief file slugs.
 * A mismatch occurs when the brief file inside a subcontext directory has a different
 * slug than the directory itself (e.g. directory renamed but brief not updated).
 */
export function detectBriefMismatches(
  subcontextAbsDir: string,
): Array<{ dir: string; expected: string; found: string }> {
  const subDirs = listSubcontexts(subcontextAbsDir)
  const mismatches: Array<{ dir: string; expected: string; found: string }> = []

  for (const subDir of subDirs) {
    const expectedBrief = `${subDir}.md`
    const dirPath = `${subcontextAbsDir}/${subDir}`
    try {
      const entries = readdirSync(dirPath)
      const mdFiles = entries.filter((f) => f.endsWith(".md"))
      // Look for a .md file that isn't the expected brief
      for (const md of mdFiles) {
        if (md !== expectedBrief) {
          // Only flag if it looks like a brief (same pattern: NNN.slug.md)
          const dirSlug = subDir.replace(/^\d+\./, "")
          const fileSlug = basename(md, ".md").replace(/^\d+\./, "")
          if (fileSlug !== dirSlug) {
            mismatches.push({ dir: subDir, expected: expectedBrief, found: md })
          }
        }
      }
    } catch {
      // missing dir — skip
    }
  }
  return mismatches
}
