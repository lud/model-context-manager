import { command } from "cleye"
import * as cli from "../lib/cli.js"
import { getConfig } from "../lib/config.js"

export const whichCommand = command(
  {
    name: "which",
    help: { description: "Print the path to the .mcm.json config file" },
  },
  () => {
    const config = getConfig()
    cli.writeln(config.configFile)
  },
)
