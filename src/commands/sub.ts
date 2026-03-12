import { command } from "cleye"
import * as p from "@clack/prompts"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import {
  getCurrentSubcontext,
  setCurrentSubcontext,
} from "../lib/global-config.js"
import { getProject } from "../lib/project.js"
import type { ResolvedProject } from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import { listSubcontexts, resolveSubcontextArg } from "../lib/subcontext.js"

export const subCommand = command(
  {
    name: "sub",
    parameters: ["<action>", "[args...]"],
    help: {
      description: "Manage subcontexts (switch, current)",
    },
  },
  async (argv) => {
    switch (argv._.action) {
      case "switch":
        return subSwitch(argv._.args)
      case "current":
      case "which":
        return subCurrent()
      default:
        cli.abortError(`Unknown sub action: ${argv._.action}`)
    }
  },
)

function getSubcontextsAbsDir(project: ResolvedProject): string {
  const subDoctypeKey = project.rawConfig.subcontextDoctype
  if (!subDoctypeKey) {
    cli.abortError("No subcontext doctype configured in .mcm.json")
  }
  const subEntry = project.doctypes[subDoctypeKey]
  if (!subEntry) {
    cli.abortError(`Subcontext doctype "${subDoctypeKey}" not found`)
  }
  return subEntry.dir // already absolute from loadRawProject
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
 * Manage subcontexts: switch between them or show the current one.
 *
 * ## Examples
 *
 * ```sh
 * mcm sub switch 1
 * mcm sub current
 * ```
 */
export function commentDoc() {}
