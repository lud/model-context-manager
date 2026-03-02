import type { DoctypeEntry } from "./project.js"

/**
 * Parse a sequence prefix from a name (filename or directory name).
 * Returns { seq, slug } or null if the name doesn't start with a numeric prefix.
 * "slug" is everything after the separator.
 */
export function parseSeqPrefix(
  name: string,
  separator: string,
): { seq: number; slug: string } | null {
  const idx = name.indexOf(separator)
  if (idx <= 0) return null
  const prefix = name.slice(0, idx)
  if (!/^\d+$/.test(prefix)) return null
  return { seq: parseInt(prefix, 10), slug: name.slice(idx + separator.length) }
}

export type Rename = { from: string; to: string }

/**
 * Compute the list of renames needed to fix sequence numbering in a list of names.
 * Names without a numeric prefix are left untouched.
 * Sorted by (seq, slug); ties broken alphabetically by slug.
 * New positions are padded to the sequenceScheme width.
 */
export function computeRenames(
  names: string[],
  opts: Pick<DoctypeEntry, "sequenceScheme" | "sequenceSeparator">,
): Rename[] {
  const sep = opts.sequenceSeparator
  const scheme = opts.sequenceScheme as string // caller ensures not "none"/"datetime"

  const sequenced: Array<{ name: string; seq: number; slug: string }> = []
  for (const name of names) {
    const parsed = parseSeqPrefix(name, sep)
    if (parsed !== null) {
      sequenced.push({ name, ...parsed })
    }
  }

  sequenced.sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq
    return a.slug.localeCompare(b.slug)
  })

  const renames: Rename[] = []
  for (let i = 0; i < sequenced.length; i++) {
    const { name, slug } = sequenced[i]
    const newSeq = (i + 1).toString().padStart(scheme.length, "0")
    const newName = `${newSeq}${sep}${slug}`
    if (newName !== name) {
      renames.push({ from: name, to: newName })
    }
  }

  return renames
}

export function formatDatetime(date: Date): string {
  const y = date.getFullYear().toString()
  const m = (date.getMonth() + 1).toString().padStart(2, "0")
  const d = date.getDate().toString().padStart(2, "0")
  const h = date.getHours().toString().padStart(2, "0")
  const min = date.getMinutes().toString().padStart(2, "0")
  const s = date.getSeconds().toString().padStart(2, "0")
  return `${y}${m}${d}${h}${min}${s}`
}

export function parseMaxSequence(files: string[], separator: string): number {
  let max = 0
  for (const file of files) {
    const idx = file.indexOf(separator)
    if (idx <= 0) continue
    const prefix = file.slice(0, idx)
    const num = parseInt(prefix, 10)
    if (!Number.isNaN(num) && num > max) max = num
  }
  return max
}

export function nextFilename(
  existingFiles: string[],
  doctype: DoctypeEntry,
  slug: string,
): string {
  const scheme = doctype.sequenceScheme
  const sep = doctype.sequenceSeparator

  if (scheme === "none") {
    return `${slug}.md`
  }

  if (scheme === "datetime") {
    const prefix = formatDatetime(new Date())
    return `${prefix}${sep}${slug}.md`
  }

  // Numeric counter scheme (e.g. "000", "0000")
  const max = parseMaxSequence(existingFiles, sep)
  const next = (max + 1).toString().padStart(scheme.length, "0")
  return `${next}${sep}${slug}.md`
}
