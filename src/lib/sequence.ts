import type { DoctypeConfig } from "./config.js"

export function formatDatetime(date: Date): string {
  const y = date.getFullYear().toString()
  const m = (date.getMonth() + 1).toString().padStart(2, "0")
  const d = date.getDate().toString().padStart(2, "0")
  const h = date.getHours().toString().padStart(2, "0")
  const min = date.getMinutes().toString().padStart(2, "0")
  const s = date.getSeconds().toString().padStart(2, "0")
  return `${y}${m}${d}${h}${min}${s}`
}

export function parseMaxSequence(
  files: string[],
  separator: string,
): number {
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
  doctype: DoctypeConfig,
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
