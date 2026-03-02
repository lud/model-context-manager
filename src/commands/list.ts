import { command } from "cleye"
import { readdirSyncOrAbort } from "../lib/fs.js"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { getProject } from "../lib/project.js"
import type { ResolvedProject } from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"

export const listCommand = command(
  {
    name: "list",
    parameters: ["[doctype]"],
    help: { description: "List doctypes or files in a doctype" },
    flags: {
      sub: {
        type: String,
        description: "Use a specific subcontext",
      },
    },
  },
  (argv) => {
    const project = getProject({ sub: argv.flags?.sub })
    const doctype = argv._.doctype
    if (doctype === undefined) {
      listAllDoctypes(project.doctypes)
    } else {
      listDoctypeFiles(project, doctype)
    }
  },
)

export function listAllDoctypes(doctypes: ResolvedProject["doctypes"]): void {
  const entries = Object.entries(doctypes)
  if (entries.length === 0) {
    cli.warning("No doctypes configured.")
    return
  }
  for (const [key, { dir }] of entries) {
    cli.writeln(`${key}: ${toDisplayPath(dir, process.cwd())}`)
  }
}

export function listDoctypeFiles(
  project: ResolvedProject,
  doctype: string,
): void {
  const entry = project.doctypes[doctype]
  if (!entry) {
    cli.abortError(`Unknown doctype: ${doctype}`)
  }
  if (entry.inSubcontext && !project.currentSubcontext) {
    cli.abortError(
      `Doctype "${doctype}" requires a subcontext. Use "mcm sub switch" to select one.`,
    )
  }
  const files = readdirSyncOrAbort(entry.dir).slice().sort()
  for (const file of files) {
    cli.writeln(toDisplayPath(join(entry.dir, file), process.cwd()))
  }
}

/**
 * List all configured doctypes or the files within a specific doctype.
 *
 * ## Examples
 *
 * ```sh
 * # List all doctypes
 * mcm list
 *
 * # List files in a doctype
 * mcm list devlogs
 * ```
 */
export function commentDoc() {}
