import { command } from "cleye"
import { existsSync, mkdirSync } from "node:fs"
import { writeFileSyncOrAbort } from "../lib/fs.js"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import {
  getProject,
  listDoctypeFilesAcrossSubcontexts,
} from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import { nextFilename } from "../lib/sequence.js"
import { slugify } from "../lib/slugify.js"

export const newCommand = command(
  {
    name: "new",
    parameters: ["<doctype>", "<title...>"],
    help: { description: "Create a new file in a doctype" },
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
    const titleWords: string[] = argv._.title

    const entry = project.doctypes[doctype]
    if (!entry) {
      cli.abortError(`Unknown doctype: ${doctype}`)
    }

    if (entry.inSubcontext && !project.currentSubcontext) {
      cli.abortError(
        `Doctype "${doctype}" requires a subcontext. Use "mcm sub switch" to select one.`,
      )
    }

    if (!existsSync(entry.dir)) {
      cli.abortError(`Directory does not exist: ${entry.dir}`)
    }

    const slug = slugify(titleWords.join(" "))
    const allEntries = listDoctypeFilesAcrossSubcontexts(project, doctype)
    const files = allEntries.flatMap((e) => e.files)
    const filename = nextFilename(files, entry, slug)
    const fullPath = join(entry.dir, filename)

    if (existsSync(fullPath)) {
      cli.abortError(`File already exists: ${fullPath}`)
    }

    writeFileSyncOrAbort(fullPath, `# ${titleWords.join(" ")}\n`)
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
