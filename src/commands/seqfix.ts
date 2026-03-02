import { command } from "cleye"
import { renameSync } from "node:fs"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { readdirSyncOrAbort } from "../lib/fs.js"
import { getProject } from "../lib/project.js"
import { computeRenames } from "../lib/sequence.js"
export { computeRenames, parseSeqPrefix } from "../lib/sequence.js"
export type { Rename } from "../lib/sequence.js"

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
export function commentDoc() {}
