import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { z } from "zod"

const DoctypeKeySchema = z.string().regex(/^[A-Za-z0-9._-]+$/)

const SequenceSchemeSchema = z
  .union([z.enum(["none", "datetime"]), z.string().regex(/^0+$/)])
  .default("000")

const DoctypeValueSchema = z.object({
  dir: z.string(),
  sequenceScheme: SequenceSchemeSchema,
  sequenceSeparator: z
    .string()
    .min(1)
    .regex(/^[^\\/\x00]+$/)
    .default("."),
})

const ConfigSchema = z.object({
  extend: z.boolean().default(false),
  doctypes: z.record(DoctypeKeySchema, DoctypeValueSchema).default({}),
})

export type Config = z.infer<typeof ConfigSchema>
export type DoctypeConfig = z.infer<typeof DoctypeValueSchema>

export function parseConfig(raw: unknown): Config {
  return ConfigSchema.parse(raw)
}

export function loadConfigOrFail(filePath: string): Config {
  const content = readFileSync(filePath, "utf-8")
  const raw = JSON.parse(content)
  const config = parseConfig(raw)

  const configDir = dirname(resolve(filePath))
  const resolvedDoctypes: Config["doctypes"] = {}
  for (const [key, value] of Object.entries(config.doctypes)) {
    resolvedDoctypes[key] = {
      ...value,
      dir: isAbsolute(value.dir) ? value.dir : join(configDir, value.dir),
    }
  }
  return { ...config, doctypes: resolvedDoctypes }
}

export function getConfig(): Config {
  const configPath = locateConfigFile(process.cwd())
  if (!configPath) return parseConfig({})
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
