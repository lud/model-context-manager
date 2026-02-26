import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import envPaths from "env-paths"
import { z } from "zod"

const GlobalConfigSchema = z
  .object({
    githubTokens: z.record(z.string(), z.string()).default({}),
  })
  .strip()

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>

const paths = envPaths("mcm", { suffix: "" })
const CONFIG_FILE = join(paths.config, "mcm.global.json")

export function globalConfigPath(): string {
  return CONFIG_FILE
}

export function getGlobalConfig(): GlobalConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { githubTokens: {} }
  }
  const content = readFileSync(CONFIG_FILE, "utf-8")
  const raw = JSON.parse(content)
  return GlobalConfigSchema.parse(raw)
}

export function saveGlobalConfig(config: GlobalConfig): void {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n")
}

export function normalizeGithubUrl(url: string): string {
  let normalized = url.replace(/^http:\/\//, "https://")
  if (!normalized.startsWith("https://")) {
    normalized = `https://github.com/${normalized}`
  }
  normalized = normalized.replace(/\.git$/, "")
  return normalized
}
