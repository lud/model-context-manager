import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { z } from "zod"

const ConfigSchema = z.object({
  extend: z.boolean().default(false),
})

export type Config = z.infer<typeof ConfigSchema>

export function parseConfig(raw: unknown): Config {
  return ConfigSchema.parse(raw)
}

export function loadConfigOrFail(filePath: string): Config {
  const content = readFileSync(filePath, "utf-8")
  const raw = JSON.parse(content)
  return parseConfig(raw)
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
