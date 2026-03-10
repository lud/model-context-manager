import { command } from "cleye"
import * as cli from "../lib/cli.js"
import { readFileSyncOrAbort, writeFileSyncOrAbort } from "../lib/fs.js"
import { setFrontmatterProperty } from "../lib/frontmatter.js"
import { toDisplayPath } from "../lib/paths.js"

export const closeCommand = command(
  {
    name: "close",
    parameters: ["<file>"],
    help: { description: "Set status to 'closed' in a file's frontmatter" },
  },
  (argv) => {
    const filePath = argv._.file
    const content = readFileSyncOrAbort(filePath, "utf-8")
    const updated = setFrontmatterProperty(content, "status", "closed")
    writeFileSyncOrAbort(filePath, updated)
    cli.writeln(toDisplayPath(filePath, process.cwd()))
  },
)

/**
 * Set the status of a file to 'closed' by updating its frontmatter.
 *
 * ## Examples
 *
 * ```sh
 * mcm close notes/001.my-note.md
 * ```
 */
export function commentDoc() {}
