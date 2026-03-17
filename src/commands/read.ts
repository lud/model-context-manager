import { command } from "cleye"
import * as cli from "../lib/cli.js"
import { readFileSyncOrAbort } from "../lib/fs.js"
import { getProject } from "../lib/project.js"
import { resolveFileArg } from "../lib/resolve-file.js"

export const readCommand = command(
  {
    name: "read",
    parameters: ["<pathOrDoctype>", "[id]"],
    help: { description: "Output the contents of a document" },
    flags: {
      sub: {
        type: String,
        description: "Use a specific subcontext",
      },
    },
  },
  (argv) => {
    const project = getProject({ sub: argv.flags.sub })
    const args: [string, string] | [string] = argv._.id
      ? [argv._.pathOrDoctype, argv._.id]
      : [argv._.pathOrDoctype]
    const filePath = resolveFileArg(project, args, process.cwd())
    const content = readFileSyncOrAbort(filePath, "utf-8")
    cli.write(content)
  },
)

/**
 * Output the full contents of a document.
 *
 * ## Examples
 *
 * ```sh
 * mcm read notes 1
 * mcm read notes my-slug
 * mcm read notes/001.my-note.md
 * ```
 */
export function commentDoc() {}
