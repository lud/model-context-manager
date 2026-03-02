import { command } from "cleye"
import { mkdirSync } from "node:fs"
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

export const subCommand = command(
  {
    name: "sub",
    parameters: ["<action>", "[args...]"],
    help: { description: "Manage subcontexts (add, switch, list, current)" },
  },
  (argv) => {
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

export function subSwitch(args: string[]): void {
  if (args.length === 0) {
    cli.abortError("Usage: mcm sub switch <number-or-name>")
  }

  const project = getProject()
  const subcontextsAbsDir = getSubcontextsAbsDir(project)

  const query = args.join(" ")
  const result = resolveSubcontextArg(subcontextsAbsDir, query)

  if (typeof result !== "string") {
    if (result.error === "not-found") {
      cli.abortError(`Subcontext not found: ${query}`)
    } else {
      cli.abortError(`Multiple subcontexts match: ${result.names.join(", ")}`)
    }
  }

  setCurrentSubcontext(project.projectDir, result)
  cli.writeln(result)
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
 * ```
 */
export function commentDoc() {}
