import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { ConfigSchema } from "../src/lib/config.js"

const jsonSchema = z.toJSONSchema(ConfigSchema, {
  target: "draft-2020-12",
  io: "input",
})

const outPath = join(import.meta.dirname, "../resources/mcm-config.schema.json")
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + "\n")

console.log(`Written ${outPath}`)
