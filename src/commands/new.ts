import { command } from "cleye"
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { getConfig } from "../lib/config.js"
import { toDisplayPath } from "../lib/paths.js"
import { nextFilename } from "../lib/sequence.js"
import { slugify } from "../lib/slugify.js"

export const newCommand = command(
  {
    name: "new",
    parameters: ["<doctype>", "<title...>"],
    help: { description: "Create a new file in a doctype" },
  },
  (argv) => {
    const config = getConfig()
    const doctype = argv._.doctype
    const titleWords: string[] = argv._.title

    const entry = config.doctypes[doctype]
    if (!entry) {
      cli.abortError(`Unknown doctype: ${doctype}`)
    }

    if (!existsSync(entry.dir)) {
      cli.abortError(`Directory does not exist: ${entry.dir}`)
    }

    const slug = slugify(titleWords.join(" "))
    const files = readdirSync(entry.dir)
    const filename = nextFilename(files, entry, slug)
    const fullPath = join(entry.dir, filename)

    if (existsSync(fullPath)) {
      cli.abortError(`File already exists: ${fullPath}`)
    }

    writeFileSync(fullPath, `# ${titleWords.join(" ")}\n`)
    cli.writeln(toDisplayPath(fullPath, process.cwd()))
  },
)

/**
 * Create a new file in a doctype directory. The filename is generated
 * from the title and the doctype's sequencing rules.
 *
 * ## Examples
 *
 * ```sh
 * mcm new devlogs "Add authentication"
 * ```
 */
export function commentDoc() {}
