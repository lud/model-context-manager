import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolveGitHubSource, applyCopy } from "./sync.js"
import type { SyncReporter, GitHubResolveResult } from "./sync.js"

const SKIP_MSG = "Set MCM_TEST_GITHUB=1 to run GitHub integration tests"

if (!process.env.MCM_TEST_GITHUB) {
  console.log(`\n  ℹ Skipping GitHub tests: ${SKIP_MSG}\n`)
}

const noopReporter: SyncReporter = {
  onCopied() {},
  onDeleted() {},
}

let targetDir: string

beforeEach(() => {
  targetDir = mkdtempSync(join(tmpdir(), "mcm-github-integ-"))
})

afterEach(() => {
  rmSync(targetDir, { recursive: true, force: true })
})

describe.skipIf(!process.env.MCM_TEST_GITHUB)("GitHub sync integration", () => {
  it("syncs a file from a public repo (no token)", { timeout: 30_000 }, () => {
    const upstream = {
      kind: "github" as const,
      repo: "octocat/Hello-World",
      path: "README",
    }
    const result: GitHubResolveResult = resolveGitHubSource(upstream)
    try {
      expect("error" in result).toBe(false)
      if (!("error" in result)) {
        const local = join(targetDir, "README")
        const syncResult = applyCopy(
          result.source,
          local,
          "receive_merge",
          noopReporter,
        )
        expect(syncResult.status).toBe("synced")
        expect(existsSync(local)).toBe(true)
      }
    } finally {
      if (!("error" in result)) result.cleanup?.()
    }
  })

  it(
    "syncs README.md from private repo lud/libcheck",
    { timeout: 30_000 },
    () => {
      const token = process.env.MCM_TEST_GITHUB_TOKEN
      if (!token) {
        console.log(
          "  ℹ MCM_TEST_GITHUB_TOKEN not set, skipping private repo test",
        )
        return
      }

      const upstream = {
        kind: "github" as const,
        repo: "lud/libcheck",
        path: "README.md",
      }
      const result: GitHubResolveResult = resolveGitHubSource(upstream, token)
      try {
        if ("error" in result) {
          if (
            result.error === "auth_failed" ||
            result.error === "auth_required"
          ) {
            console.log(
              "\n  ⚠ Token may be expired — verify MCM_TEST_GITHUB_TOKEN\n",
            )
          }
          expect("error" in result).toBe(false)
          return
        }

        const local = join(targetDir, "README.md")
        const syncResult = applyCopy(
          result.source,
          local,
          "receive_merge",
          noopReporter,
        )
        expect(syncResult.status).toBe("synced")
        expect(existsSync(local)).toBe(true)
        expect(readFileSync(local, "utf-8").length).toBeGreaterThan(0)
      } finally {
        if (!("error" in result)) result.cleanup?.()
      }
    },
  )
})
