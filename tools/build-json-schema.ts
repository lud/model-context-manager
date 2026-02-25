import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { ProjectSchema } from "../src/lib/project.js"

const jsonSchema = z.toJSONSchema(ProjectSchema, {
  target: "draft-2020-12",
  io: "input",
})

const outPath = join(
  import.meta.dirname,
  "../resources/mcm-project.schema.json",
)
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + "\n")

console.log(`Written ${outPath}`)
