import { command } from "cleye"
import { renameSync } from "node:fs"
import { join, relative } from "node:path"
import * as cli from "../lib/cli.js"
import { readdirSyncOrAbort } from "../lib/fs.js"
import {
  getProject,
  listDoctypeFilesAcrossSubcontexts,
  resolveDoctypeArg,
} from "../lib/project.js"
import { DoctypeRole } from "../lib/project.js"
import type { ResolvedDoctypeEntry, ResolvedProject } from "../lib/project.js"
import { computeGlobalRenames, computeRenames } from "../lib/sequence.js"
import type { Rename } from "../lib/sequence.js"
import {
  getCurrentSubcontext,
  setCurrentSubcontext,
} from "../lib/global-config.js"
import { listSubcontexts } from "../lib/subcontext.js"
export { computeRenames, parseSeqPrefix } from "../lib/sequence.js"
export type { Rename } from "../lib/sequence.js"

type SeqfixPlan = {
  displayLines: string[]
  apply: () => void
  successMessage: string
}

function planSubcontextSeqfix(
  project: ResolvedProject,
  entry: ResolvedDoctypeEntry,
): SeqfixPlan | null {
  const subcontextsAbsDir = entry.dir
  const dirs = listSubcontexts(subcontextsAbsDir)
  const renames = computeRenames(dirs, {
    sequenceScheme: "000",
    sequenceSeparator: ".",
  })

  if (renames.length === 0) return null

  return {
    displayLines: renames.map(({ from, to }) => `${from} → ${to}`),
    apply: () => {
      twoPhaseRename(subcontextsAbsDir, renames)
      renameBriefs(subcontextsAbsDir, renames)
      updateCurrentSubcontext(project, renames)
    },
    successMessage: `Renamed ${renames.length} dir(s).`,
  }
}

function planManagedSeqfix(
  project: ResolvedProject,
  entry: ResolvedDoctypeEntry,
  doctype: string,
): SeqfixPlan | null {
  const subDoctypeKey = project.rawConfig.subcontextDoctype!
  const subEntry = project.doctypes[subDoctypeKey]
  const subcontextsAbsDir = subEntry.dir

  const allEntries = listDoctypeFilesAcrossSubcontexts(project, doctype)
  const renames = computeGlobalRenames(allEntries, entry)

  if (renames.length === 0) return null

  return {
    displayLines: renames.map(({ dir, from, to }) => {
      const relFrom = relative(subcontextsAbsDir, join(dir, from))
      const relTo = relative(subcontextsAbsDir, join(dir, to))
      return `${relFrom} → ${relTo}`
    }),
    apply: () => {
      const byDir = new Map<string, Array<{ from: string; to: string }>>()
      for (const { dir, from, to } of renames) {
        if (!byDir.has(dir)) byDir.set(dir, [])
        byDir.get(dir)!.push({ from, to })
      }
      for (const [dir, dirRenames] of byDir) {
        twoPhaseRename(dir, dirRenames)
      }
    },
    successMessage: `Renamed ${renames.length} file(s).`,
  }
}

function planRegularSeqfix(entry: ResolvedDoctypeEntry): SeqfixPlan | null {
  const files = readdirSyncOrAbort(entry.dir)
  const renames = computeRenames(files, entry)

  if (renames.length === 0) return null

  return {
    displayLines: renames.map(({ from, to }) => `${from} → ${to}`),
    apply: () => twoPhaseRename(entry.dir, renames),
    successMessage: `Renamed ${renames.length} file(s).`,
  }
}

function planSeqfix(
  project: ResolvedProject,
  entry: ResolvedDoctypeEntry,
  doctype: string,
): SeqfixPlan | null {
  switch (entry.role) {
    case DoctypeRole.Subcontext:
      return planSubcontextSeqfix(project, entry)
    case DoctypeRole.Managed:
      return planManagedSeqfix(project, entry, doctype)
    case DoctypeRole.Regular:
      return planRegularSeqfix(entry)
  }
}

// --- Shared helpers ---

function twoPhaseRename(dir: string, renames: Rename[]): void {
  const tmpSuffix = ".seqfix-tmp"
  for (const { from } of renames) {
    renameSync(join(dir, from), join(dir, from + tmpSuffix))
  }
  for (const { from, to } of renames) {
    renameSync(join(dir, from + tmpSuffix), join(dir, to))
  }
}

function renameBriefs(subcontextsAbsDir: string, renames: Rename[]): void {
  for (const { from, to } of renames) {
    const oldBrief = join(subcontextsAbsDir, to, `${from}.md`)
    const newBrief = join(subcontextsAbsDir, to, `${to}.md`)
    try {
      renameSync(oldBrief, newBrief)
    } catch {
      // Brief may not exist yet
    }
  }
}

function updateCurrentSubcontext(
  project: ResolvedProject,
  renames: Rename[],
): void {
  const current = getCurrentSubcontext(project.projectDir)
  const renamed = renames.find((r) => r.from === current)
  if (renamed) {
    setCurrentSubcontext(project.projectDir, renamed.to)
  }
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
    },
  },
  (argv) => {
    const project = getProject()
    const doctype = resolveDoctypeArg(project, argv._.doctype)

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

    const plan = planSeqfix(project, entry, doctype)

    if (!plan) {
      cli.info("Nothing to rename.")
      return
    }

    for (const line of plan.displayLines) {
      cli.info(line)
    }

    if (!argv.flags?.force) {
      cli.info("")
      cli.info("Run with -f to apply changes.")
      return
    }

    plan.apply()
    cli.success(plan.successMessage)
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
 * mcm seqfix features -f
 * ```
 */
export function commentDoc() {}
