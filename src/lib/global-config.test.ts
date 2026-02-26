import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"

const workspace = mkdtempSync(join(tmpdir(), "mcm-test-global-config-"))
const configDir = join(workspace, "config-dir")

vi.mock("env-paths", () => ({
  default: () => ({ config: configDir }),
}))

const {
  getGlobalConfig,
  saveGlobalConfig,
  globalConfigPath,
  normalizeGithubUrl,
} = await import("./global-config.js")

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

beforeEach(() => {
  // Clean the config dir between tests
  rmSync(configDir, { recursive: true, force: true })
})

describe("globalConfigPath", () => {
  it("returns path inside the config directory", () => {
    expect(globalConfigPath()).toBe(join(configDir, "mcm.global.json"))
  })
})

describe("getGlobalConfig", () => {
  it("returns defaults when no file exists", () => {
    expect(getGlobalConfig()).toEqual({ githubTokens: {} })
  })

  it("reads and parses existing file", () => {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, "mcm.global.json"),
      JSON.stringify({
        githubTokens: { "https://github.com/owner/repo": "tok_123" },
      }),
    )
    expect(getGlobalConfig()).toEqual({
      githubTokens: { "https://github.com/owner/repo": "tok_123" },
    })
  })

  it("strips unknown fields", () => {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, "mcm.global.json"),
      JSON.stringify({ githubTokens: {}, extra: "ignored" }),
    )
    expect(getGlobalConfig()).toEqual({ githubTokens: {} })
  })

  it("throws on invalid JSON", () => {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, "mcm.global.json"), "not json{{{")
    expect(() => getGlobalConfig()).toThrow()
  })
})

describe("saveGlobalConfig", () => {
  it("saves file and creates directory", () => {
    saveGlobalConfig({
      githubTokens: { "https://github.com/a/b": "tok" },
    })
    const saved = getGlobalConfig()
    expect(saved).toEqual({
      githubTokens: { "https://github.com/a/b": "tok" },
    })
  })

  it("overwrites existing file", () => {
    saveGlobalConfig({ githubTokens: { "https://github.com/a/b": "old" } })
    saveGlobalConfig({ githubTokens: { "https://github.com/a/b": "new" } })
    expect(getGlobalConfig()).toEqual({
      githubTokens: { "https://github.com/a/b": "new" },
    })
  })
})

describe("normalizeGithubUrl", () => {
  it("strips .git suffix", () => {
    expect(normalizeGithubUrl("https://github.com/owner/repo.git")).toBe(
      "https://github.com/owner/repo",
    )
  })

  it("converts http to https", () => {
    expect(normalizeGithubUrl("http://github.com/owner/repo")).toBe(
      "https://github.com/owner/repo",
    )
  })

  it("prepends https://github.com/ for short form", () => {
    expect(normalizeGithubUrl("owner/repo")).toBe(
      "https://github.com/owner/repo",
    )
  })

  it("leaves valid https URL unchanged", () => {
    expect(normalizeGithubUrl("https://github.com/owner/repo")).toBe(
      "https://github.com/owner/repo",
    )
  })
})
