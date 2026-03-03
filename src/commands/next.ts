import { command } from "cleye"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import {
  getProject,
  listDoctypeFilesAcrossSubcontexts,
} from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import { nextFilename } from "../lib/sequence.js"
import { slugify } from "../lib/slugify.js"

export const nextCommand = command(
  {
    name: "next",
    parameters: ["<doctype>", "[title...]"],
    help: { description: "Print the next filename for a doctype" },
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
    const titleWords: string[] = argv._.title ?? []

    const entry = project.doctypes[doctype]
    if (!entry) {
      cli.abortError(`Unknown doctype: ${doctype}`)
    }

    if (entry.inSubcontext && !project.currentSubcontext) {
      cli.abortError(
        `Doctype "${doctype}" requires a subcontext. Use "mcm sub switch" to select one.`,
      )
    }

    const slug =
      titleWords.length > 0 ? slugify(titleWords.join(" ")) : "title-of-doc"

    const allEntries = listDoctypeFilesAcrossSubcontexts(project, doctype)
    const files = allEntries.flatMap((e) => e.files)

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
