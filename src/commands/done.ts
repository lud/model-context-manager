import { command } from "cleye"
import * as cli from "../lib/cli.js"
import { readFileSyncOrAbort, writeFileSyncOrAbort } from "../lib/fs.js"
import { setFrontmatterProperty } from "../lib/frontmatter.js"
import { getProject } from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import { resolveFileArg } from "../lib/resolve-file.js"

export const doneCommand = command(
  {
    name: "done",
    parameters: ["<pathOrDoctype>", "[id]"],
    help: { description: "Set status to 'done' in a file's frontmatter" },
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
    const updated = setFrontmatterProperty(content, "status", "done")
    writeFileSyncOrAbort(filePath, updated)
    cli.writeln(toDisplayPath(filePath, process.cwd()))
  },
)

/**
 * Set the status of a file to 'done' by updating its frontmatter.
 *
 * ## Examples
 *
 * ```sh
 * mcm done notes 1
 * mcm done notes/001.my-note.md
 * ```
 */
export function commentDoc() {}
