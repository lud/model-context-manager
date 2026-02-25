import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { z } from "zod"
import { abortError } from "./cli.js"

const DoctypeKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]+$/)
  .describe(
    "Doctype name. Only letters, digits, dots, hyphens, and underscores are allowed.",
  )

const SequenceSchemeSchema = z
  .union([z.enum(["none", "datetime"]), z.string().regex(/^0+$/)])
  .default("000")
  .describe(
    "How filenames are sequenced. " +
      '"none" disables sequencing. ' +
      '"datetime" uses a YYYYMMDDHHmmss timestamp. ' +
      'A string of zeroes (e.g. "000") zero-pads to that width.',
  )

const DoctypeValueSchema = z
  .object({
    dir: z
      .string()
      .describe(
        "Directory where files of this doctype are stored. Relative paths are resolved from the config file location.",
      ),
    sequenceScheme: SequenceSchemeSchema,
    sequenceSeparator: z
      .string()
      .min(1)
      .regex(/^[^\\/\x00]+$/)
      .default(".")
      .describe(
        "Separator between the sequence number and the slug in generated filenames.",
      ),
  })
  .describe("Configuration for a single doctype.")

export const ProjectSchema = z
  .object({
    extend: z
      .boolean()
      .default(false)
      .describe(
        "Reserved for future use. When true, this config will extend a parent config.",
      ),
    doctypes: z
      .record(DoctypeKeySchema, DoctypeValueSchema)
      .default({})
      .describe("Map of doctype names to their configuration."),
  })
  .describe("MCM configuration file.")

export type Project = z.infer<typeof ProjectSchema>
export type DoctypeEntry = z.infer<typeof DoctypeValueSchema>
export type ResolvedProject = Project & {
  projectFile: string
  projectDir: string
}

export function parseProject(raw: unknown): Project {
  return ProjectSchema.parse(raw)
}

export function loadProjectOrFail(filePath: string): ResolvedProject {
  const content = readFileSync(filePath, "utf-8")
  const raw = JSON.parse(content)
  const project = parseProject(raw)

  const projectFile = resolve(filePath)
  const projectDir = dirname(projectFile)
  const resolvedDoctypes: Project["doctypes"] = {}
  for (const [key, value] of Object.entries(project.doctypes)) {
    resolvedDoctypes[key] = {
      ...value,
      dir: isAbsolute(value.dir) ? value.dir : join(projectDir, value.dir),
    }
  }
  return { ...project, projectFile, projectDir, doctypes: resolvedDoctypes }
}

export function getProject(): ResolvedProject {
  const projectPath = locateProjectFile(process.cwd())
  if (!projectPath) {
    abortError("Could not find .mcm.json configuration file")
  }
  return loadProjectOrFail(projectPath)
}

export function locateProjectFile(cwd: string): string | null {
  let dir = resolve(cwd)

  for (;;) {
    try {
      const candidate = join(dir, ".mcm.json")
      if (existsSync(candidate)) return candidate
    } catch {
      return null
    }

    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
