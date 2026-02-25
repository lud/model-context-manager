import { command } from "cleye"
import * as cli from "../lib/cli.js"
import { getProject } from "../lib/project.js"

export const whichCommand = command(
  {
    name: "which",
    help: { description: "Print the path to the .mcm.json config file" },
  },
  () => {
    const project = getProject()
    cli.writeln(project.projectFile)
  },
)

/**
 * Print the absolute path to the `.mcm.json` config file that MCM
 * resolved from the current working directory.
 *
 * ## Examples
 *
 * ```sh
 * mcm which
 * ```
 */
export function commentDoc() {}
