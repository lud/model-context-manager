import { command } from "cleye"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { getConfig } from "../lib/config.js"
import { toDisplayPath } from "../lib/paths.js"
import { nextFilename } from "../lib/sequence.js"
import { slugify } from "../lib/slugify.js"

export const nextCommand = command(
  {
    name: "next",
    parameters: ["<doctype>", "[title...]"],
    help: { description: "Print the next filename for a doctype" },
  },
  (argv) => {
    const config = getConfig()
    const doctype = argv._.doctype
    const titleWords: string[] = argv._.title ?? []

    const entry = config.doctypes[doctype]
    if (!entry) {
      cli.abortError(`Unknown doctype: ${doctype}`)
    }

    const slug =
      titleWords.length > 0 ? slugify(titleWords.join(" ")) : "title-of-doc"

    let files: string[] = []
    try {
      files = readdirSync(entry.dir)
    } catch {
      // treat missing dir as empty
    }

    const filename = nextFilename(files, entry, slug)
    cli.writeln(toDisplayPath(join(entry.dir, filename), process.cwd()))
  },
)

/**
 * Print the next filename that would be created for a doctype,
 * without actually creating the file.
 *
 * ## Examples
 *
 * ```sh
 * mcm next devlogs "My title"
 * mcm next devlogs
 * ```
 */
export function commentDoc() {}
