import { command } from "cleye"
import { renameSync } from "node:fs"
import { isAbsolute, join, relative } from "node:path"
import * as cli from "../lib/cli.js"
import { readdirSyncOrAbort } from "../lib/fs.js"
import {
  getProject,
  listDoctypeFilesAcrossSubcontexts,
} from "../lib/project.js"
import { computeGlobalRenames, computeRenames } from "../lib/sequence.js"
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
    },
  },
  (argv) => {
    const project = getProject()
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

    if (entry.inSubcontext) {
      const rawSubcontextsDir = project.rawConfig.subcontexts!.dir
      const subcontextsAbsDir = isAbsolute(rawSubcontextsDir)
        ? rawSubcontextsDir
        : join(project.projectDir, rawSubcontextsDir)

      const allEntries = listDoctypeFilesAcrossSubcontexts(project, doctype)
      const renames = computeGlobalRenames(allEntries, entry)

      if (renames.length === 0) {
        cli.info("Nothing to rename.")
        return
      }

      for (const { dir, from, to } of renames) {
        const relFrom = relative(subcontextsAbsDir, join(dir, from))
        const relTo = relative(subcontextsAbsDir, join(dir, to))
        cli.info(`${relFrom} → ${relTo}`)
      }

      if (!argv.flags?.force) {
        cli.info("")
        cli.info("Run with -f to apply changes.")
        return
      }

      // Group renames by dir, then two-phase rename per dir
      const byDir = new Map<string, Array<{ from: string; to: string }>>()
      for (const { dir, from, to } of renames) {
        if (!byDir.has(dir)) byDir.set(dir, [])
        byDir.get(dir)!.push({ from, to })
      }

      const tmpSuffix = ".seqfix-tmp"
      for (const [dir, dirRenames] of byDir) {
        for (const { from } of dirRenames) {
          renameSync(join(dir, from), join(dir, from + tmpSuffix))
        }
        for (const { from, to } of dirRenames) {
          renameSync(join(dir, from + tmpSuffix), join(dir, to))
        }
      }

      cli.success(`Renamed ${renames.length} file(s).`)
    } else {
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
    }
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
