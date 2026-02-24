import { command } from "cleye"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { getConfig } from "../lib/config.js"
import type { Config } from "../lib/config.js"
import { toDisplayPath } from "../lib/paths.js"

export const listCommand = command(
  {
    name: "list",
    parameters: ["[doctype]"],
    help: { description: "List doctypes or files in a doctype" },
  },
  (argv) => {
    const config = getConfig()
    const doctype = argv._.doctype
    if (doctype === undefined) {
      listAllDoctypes(config.doctypes)
    } else {
      listDoctypeFiles(config.doctypes, doctype)
    }
  },
)

export function listAllDoctypes(doctypes: Config["doctypes"]): void {
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
  doctypes: Config["doctypes"],
  doctype: string,
): void {
  const entry = doctypes[doctype]
  if (!entry) {
    cli.abortError(`Unknown doctype: ${doctype}`)
  }
  const files = readdirSync(entry.dir).slice().sort()
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
