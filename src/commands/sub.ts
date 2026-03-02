import { command } from "cleye"
import * as p from "@clack/prompts"
import { mkdirSync, renameSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import * as cli from "../lib/cli.js"
import {
  getCurrentSubcontext,
  setCurrentSubcontext,
} from "../lib/global-config.js"
import { getProject } from "../lib/project.js"
import type { ResolvedProject } from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import {
  listSubcontexts,
  nextSubcontextDirName,
  resolveSubcontextArg,
} from "../lib/subcontext.js"
import { slugify } from "../lib/slugify.js"
import { computeRenames } from "../lib/sequence.js"

export const subCommand = command(
  {
    name: "sub",
    parameters: ["<action>", "[args...]"],
    help: {
      description: "Manage subcontexts (add, switch, list, current, seqfix)",
    },
    flags: {
      force: {
        type: Boolean,
        alias: "f",
        default: false,
        description: "Apply changes (for seqfix, default: dry-run)",
      },
    },
  },
  async (argv) => {
    switch (argv._.action) {
      case "add":
        return subAdd(argv._.args)
      case "switch":
        return subSwitch(argv._.args)
      case "list":
        return subList()
      case "current":
      case "which":
        return subCurrent()
      case "seqfix":
        return subSeqfix(argv.flags?.force ?? false)
      default:
        cli.abortError(`Unknown sub action: ${argv._.action}`)
    }
  },
)

function getSubcontextsAbsDir(project: ResolvedProject): string {
  if (!project.subcontexts) {
    cli.abortError("No subcontexts configured in .mcm.json")
  }
  const { dir } = project.subcontexts
  return isAbsolute(dir) ? dir : join(project.projectDir, dir)
}

export function subAdd(args: string[]): void {
  if (args.length === 0) {
    cli.abortError("Usage: mcm sub add <slug...>")
  }

  const project = getProject()
  const subcontextsAbsDir = getSubcontextsAbsDir(project)

  const slug = slugify(args.join(" "))
  const existingDirs = listSubcontexts(subcontextsAbsDir)
  const dirName = nextSubcontextDirName(existingDirs, slug)
  const subcontextPath = join(subcontextsAbsDir, dirName)

  mkdirSync(subcontextPath, { recursive: true })

  for (const key of project.subcontexts!.doctypes) {
    const rawDir = project.rawConfig.doctypes[key]?.dir
    if (rawDir) {
      mkdirSync(join(subcontextPath, rawDir), { recursive: true })
    }
  }

  setCurrentSubcontext(project.projectDir, dirName)
  cli.writeln(toDisplayPath(subcontextPath, process.cwd()))
}

export async function subSwitch(args: string[]): Promise<void> {
  const project = getProject()
  const subcontextsAbsDir = getSubcontextsAbsDir(project)

  let name: string

  if (args.length === 0) {
    const dirs = listSubcontexts(subcontextsAbsDir)
    if (dirs.length === 0) {
      cli.abortError("No subcontexts found.")
    }
    const current = getCurrentSubcontext(project.projectDir)
    const selected = await p.select({
      message: "Switch to subcontext",
      options: dirs.map((dir) => ({ value: dir, label: dir })),
      initialValue: current,
    })
    if (p.isCancel(selected)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }
    name = selected
  } else {
    const query = args.join(" ")
    const result = resolveSubcontextArg(subcontextsAbsDir, query)
    if (typeof result !== "string") {
      if (result.error === "not-found") {
        cli.abortError(`Subcontext not found: ${query}`)
      } else {
        cli.abortError(`Multiple subcontexts match: ${result.names.join(", ")}`)
      }
    }
    name = result
  }

  setCurrentSubcontext(project.projectDir, name)
  cli.writeln(name)
}

export function subList(): void {
  const project = getProject()
  const subcontextsAbsDir = getSubcontextsAbsDir(project)

  const dirs = listSubcontexts(subcontextsAbsDir)
  if (dirs.length === 0) {
    cli.warning("No subcontexts found.")
    return
  }

  const current = getCurrentSubcontext(project.projectDir)
  for (const dir of dirs) {
    const marker = dir === current ? " *" : ""
    cli.writeln(`${dir}${marker}`)
  }
}

export function subCurrent(): void {
  const project = getProject()
  const subcontextsAbsDir = getSubcontextsAbsDir(project)

  const current = getCurrentSubcontext(project.projectDir)
  if (!current) {
    cli.abortError(
      'No subcontext selected. Use "mcm sub switch" to select one.',
    )
  }

  cli.writeln(toDisplayPath(join(subcontextsAbsDir, current), process.cwd()))
}

export function subSeqfix(force: boolean): void {
  const project = getProject()
  const subcontextsAbsDir = getSubcontextsAbsDir(project)

  const dirs = listSubcontexts(subcontextsAbsDir)
  const renames = computeRenames(dirs, {
    sequenceScheme: "000",
    sequenceSeparator: ".",
  })

  if (renames.length === 0) {
    cli.info("Nothing to rename.")
    return
  }

  for (const { from, to } of renames) {
    cli.info(`${from} → ${to}`)
  }

  if (!force) {
    cli.info("")
    cli.info("Run with -f to apply changes.")
    return
  }

  const current = getCurrentSubcontext(project.projectDir)

  // Two-phase rename to avoid conflicts: old → temp → new
  const tmpSuffix = ".seqfix-tmp"
  for (const { from } of renames) {
    renameSync(
      join(subcontextsAbsDir, from),
      join(subcontextsAbsDir, from + tmpSuffix),
    )
  }
  for (const { from, to } of renames) {
    renameSync(
      join(subcontextsAbsDir, from + tmpSuffix),
      join(subcontextsAbsDir, to),
    )
  }

  // Keep global config in sync if the active subcontext was renamed
  const renamed = renames.find((r) => r.from === current)
  if (renamed) {
    setCurrentSubcontext(project.projectDir, renamed.to)
  }

  cli.success(`Renamed ${renames.length} dir(s).`)
}

/**
 * Manage subcontexts: add, switch between, list, or show the current one.
 *
 * ## Examples
 *
 * ```sh
 * mcm sub add my-feature
 * mcm sub switch 1
 * mcm sub list
 * mcm sub current
 * mcm sub seqfix
 * mcm sub seqfix -f
 * ```
 */
export function commentDoc() {}
