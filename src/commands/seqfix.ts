import { command } from "cleye"
import { renameSync } from "node:fs"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { readdirSyncOrAbort } from "../lib/fs.js"
import { getProject } from "../lib/project.js"
import type { DoctypeEntry } from "../lib/project.js"

/**
 * Parse a sequence prefix from a filename.
 * Returns { seq, slug } or null if the file doesn't match.
 * "slug" is everything after the separator (including the extension).
 */
export function parseSeqPrefix (
  filename: string,
  separator: string,
): { seq: number; slug: string } | null {
  const idx = filename.indexOf(separator)
  if (idx <= 0) return null
  const prefix = filename.slice(0, idx)
  if (!/^\d+$/.test(prefix)) return null
  const seq = parseInt(prefix, 10)
  return { seq, slug: filename.slice(idx + separator.length) }
}

export type Rename = { from: string; to: string }

/**
 * Compute the list of renames needed to fix sequence numbering.
 * Files without a sequence prefix are left untouched.
 * Sorted by (seq, slug); ties broken alphabetically by slug.
 * New positions use the doctype's sequenceScheme for padding.
 */
export function computeRenames (
  files: string[],
  doctype: Pick<DoctypeEntry, "sequenceScheme" | "sequenceSeparator">,
): Rename[] {
  const sep = doctype.sequenceSeparator
  const scheme = doctype.sequenceScheme as string // caller ensures not "none"/"datetime"

  const sequenced: Array<{ filename: string; seq: number; slug: string }> = []
  for (const filename of files) {
    const parsed = parseSeqPrefix(filename, sep)
    if (parsed !== null) {
      sequenced.push({ filename, ...parsed })
    }
  }

  sequenced.sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq
    return a.slug.localeCompare(b.slug)
  })

  const renames: Rename[] = []
  for (let i = 0; i < sequenced.length; i++) {
    const { filename, slug } = sequenced[i]
    const newSeq = (i + 1).toString().padStart(scheme.length, "0")
    const newFilename = `${newSeq}${sep}${slug}`
    if (newFilename !== filename) {
      renames.push({ from: filename, to: newFilename })
    }
  }

  return renames
}

export const seqfixCommand = command(
  {
    name: "seqfix",
    parameters: ["<doctype>"],
    help: {
      description: "Renumber sequenced files in a doctype directory",
    },
    flags: {
      force: {
        type: Boolean,
        alias: "f",
        default: false,
        description: "Apply the renames (default: dry-run)",
      },
      sub: {
        type: String,
        description: "Use a specific subcontext",
      },
    },
  },
  (argv) => {
    const project = getProject({ sub: argv.flags?.sub })
    const doctype = argv._.doctype

    const entry = project.doctypes[doctype]
    if (!entry) {
      cli.abortError(`Unknown doctype: ${doctype}`)
    }

    if (
      entry.sequenceScheme === "none" ||
      entry.sequenceScheme === "datetime"
    ) {
      cli.abortError(
        `seqfix does not support sequenceScheme "${entry.sequenceScheme}"`,
      )
    }

    const files = readdirSyncOrAbort(entry.dir)

    const renames = computeRenames(files, entry)

    if (renames.length === 0) {
      cli.info("Nothing to rename.")
      return
    }

    for (const { from, to } of renames) {
      cli.info(`${from} → ${to}`)
    }

    if (!argv.flags?.force) {
      cli.info("")
      cli.info("Run with -f to apply changes.")
      return
    }

    // Two-phase rename to avoid conflicts: old → temp → new
    const tmpSuffix = ".seqfix-tmp"
    for (const { from } of renames) {
      renameSync(join(entry.dir, from), join(entry.dir, from + tmpSuffix))
    }
    for (const { from, to } of renames) {
      renameSync(join(entry.dir, from + tmpSuffix), join(entry.dir, to))
    }

    cli.success(`Renamed ${renames.length} file(s).`)
  },
)

/**
 * Renumber sequenced files in a doctype directory so there are no gaps
 * or duplicates. By default this is a dry-run; pass -f to apply.
 *
 * ## Examples
 *
 * ```sh
 * mcm seqfix devlogs
 * mcm seqfix devlogs -f
 * ```
 */
export function commentDoc () { }
