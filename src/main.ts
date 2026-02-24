import { cli } from "cleye"
import { demoCommand } from "./commands/demo.js"
import { listCommand } from "./commands/list.js"
import { newCommand } from "./commands/new.js"
import { nextCommand } from "./commands/next.js"

cli({
  name: "mcm",
  version: "0.1.0",
  commands: [demoCommand, listCommand, newCommand, nextCommand],
})
