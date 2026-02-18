import { cli } from "cleye"
import { demoCommand } from "./commands/demo.js"

cli({
  name: "mcm",
  version: "0.1.0",
  commands: [demoCommand],
})
