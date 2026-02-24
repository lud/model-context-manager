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

export const ConfigSchema = z
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

export type Config = z.infer<typeof ConfigSchema>
export type DoctypeConfig = z.infer<typeof DoctypeValueSchema>
export type ResolvedConfig = Config & { configFile: string; configDir: string }

export function parseConfig(raw: unknown): Config {
  return ConfigSchema.parse(raw)
}

export function loadConfigOrFail(filePath: string): ResolvedConfig {
  const content = readFileSync(filePath, "utf-8")
  const raw = JSON.parse(content)
  const config = parseConfig(raw)

  const configFile = resolve(filePath)
  const configDir = dirname(configFile)
  const resolvedDoctypes: Config["doctypes"] = {}
  for (const [key, value] of Object.entries(config.doctypes)) {
    resolvedDoctypes[key] = {
      ...value,
      dir: isAbsolute(value.dir) ? value.dir : join(configDir, value.dir),
    }
  }
  return { ...config, configFile, configDir, doctypes: resolvedDoctypes }
}

export function getConfig(): ResolvedConfig {
  const configPath = locateConfigFile(process.cwd())
  if (!configPath) {
    abortError("Could not find .mcm.json configuration file")
  }
  return loadConfigOrFail(configPath)
}

export function locateConfigFile(cwd: string): string | null {
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
