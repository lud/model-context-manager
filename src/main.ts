import { cli as cleyeCLI } from "cleye"
import { doneCommand } from "./commands/done.js"
import { listCommand } from "./commands/list.js"
import { newCommand } from "./commands/new.js"
import { nextCommand } from "./commands/next.js"
import { seqfixCommand } from "./commands/seqfix.js"
import { subCommand } from "./commands/sub.js"
import { initCommand } from "./commands/init.js"
import { syncCommand } from "./commands/sync.js"
import { whichCommand } from "./commands/which.js"
import { abortError } from "./lib/cli.js"

const argv = cleyeCLI({
  name: "mcm",
  version: "0.1.0",
  commands: [
    initCommand,
    listCommand,
    newCommand,
    nextCommand,
    doneCommand,
    subCommand,
    seqfixCommand,
    whichCommand,
    syncCommand,
  ],
  strictFlags: true,
})

if (argv.command === undefined) {
  argv.showHelp()
  if (argv._[0]) {
    abortError(`Unknown command ${argv._[0]}`)
  }
}
