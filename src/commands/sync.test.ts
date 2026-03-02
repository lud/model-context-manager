import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as p from "@clack/prompts"
import { syncCommand, MAX_NETWORK_RETRIES } from "./sync.js"
import { mockProject } from "../lib/project.test-helpers.js"
import {
  resolveLocalSource,
  resolveGitHubSource,
  applyCopy,
} from "../lib/sync.js"
import { getGlobalConfig, saveGlobalConfig } from "../lib/global-config.js"
import type { ResolvedSyncSpec } from "../lib/project.js"
import type { GlobalConfig } from "../lib/global-config.js"

vi.mock("@clack/prompts")
vi.mock("../lib/project.js")
vi.mock("../lib/sync.js")

// Preserve normalizeGithubUrl (pure function) — only mock I/O functions
vi.mock("../lib/global-config.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/global-config.js")>()
  return { ...actual, getGlobalConfig: vi.fn(), saveGlobalConfig: vi.fn() }
})

function mockGlobalConfig(overrides: Partial<GlobalConfig> = {}): void {
  vi.mocked(getGlobalConfig).mockReturnValue({
    githubTokens: {},
    currentSubcontexts: {},
    ...overrides,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(p.isCancel).mockReturnValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const localSpec: ResolvedSyncSpec = {
  upstream: { kind: "localfs", path: "/src/data" },
  local: "/project/data",
  mode: "receive_merge",
}

const githubSpec: ResolvedSyncSpec = {
  upstream: { kind: "github", repo: "owner/repo", path: "src/lib" },
  local: "/project/vendor",
  mode: "receive_merge",
}

// --- Local sync ---

describe("syncCommand local", () => {
  it("reports when no sync specs configured", async () => {
    mockProject({ sync: [] })

    await syncCommand.callback!({ _: {} })

    expect(p.log.warning).toHaveBeenCalledWith(
      "No synchronisation is configured in .mcm.json",
    )
  })

  it("calls resolveLocalSource and applyCopy for localfs upstream", async () => {
    mockProject({ sync: [localSpec] })
    const handle = {
      source: { found: true, path: "/src/data", type: "directory" as const },
    }
    vi.mocked(resolveLocalSource).mockReturnValue(handle)
    vi.mocked(applyCopy).mockReturnValue({ status: "synced" })

    await syncCommand.callback!({ _: {} })

    expect(resolveLocalSource).toHaveBeenCalledWith(localSpec.upstream)
    expect(applyCopy).toHaveBeenCalledWith(
      handle.source,
      localSpec.local,
      localSpec.mode,
      expect.objectContaining({
        onCopied: expect.any(Function),
        onDeleted: expect.any(Function),
      }),
    )
    expect(p.log.success).toHaveBeenCalled()
  })

  it("reports skipped result", async () => {
    mockProject({ sync: [localSpec] })
    vi.mocked(resolveLocalSource).mockReturnValue({ source: { found: false } })
    vi.mocked(applyCopy).mockReturnValue({
      status: "skipped",
      reason: "Source does not exist",
    })

    await syncCommand.callback!({ _: {} })

    expect(p.log.warning).toHaveBeenCalledWith("Skipped: Source does not exist")
  })

  it("exits on error result", async () => {
    mockProject({ sync: [localSpec] })
    vi.mocked(resolveLocalSource).mockReturnValue({ source: { found: false } })
    vi.mocked(applyCopy).mockReturnValue({
      status: "error",
      message: "something broke",
    })
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    await syncCommand.callback!({ _: {} })

    expect(p.log.error).toHaveBeenCalledWith("something broke")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("reports deleted_target result", async () => {
    mockProject({ sync: [localSpec] })
    vi.mocked(resolveLocalSource).mockReturnValue({ source: { found: false } })
    vi.mocked(applyCopy).mockReturnValue({ status: "deleted_target" })

    await syncCommand.callback!({ _: {} })

    expect(p.log.warning).toHaveBeenCalledWith(
      expect.stringContaining("Deleted target"),
    )
  })
})

// --- GitHub sync ---

describe("syncCommand GitHub", () => {
  it("calls resolveGitHubSource with stored token", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({
      githubTokens: { "https://github.com/owner/repo": "stored-token" },
    })
    const handle = {
      source: { found: true, path: "/tmp/x", type: "directory" as const },
      cleanup: vi.fn(),
    }
    vi.mocked(resolveGitHubSource).mockReturnValue(handle)
    vi.mocked(applyCopy).mockReturnValue({ status: "synced" })

    await syncCommand.callback!({ _: {} })

    expect(resolveGitHubSource).toHaveBeenCalledWith(
      githubSpec.upstream,
      "stored-token",
    )
    expect(applyCopy).toHaveBeenCalled()
    expect(handle.cleanup).toHaveBeenCalled()
    expect(p.log.success).toHaveBeenCalled()
  })

  it("passes undefined token when no token stored", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({ githubTokens: {} })
    const handle = {
      source: { found: true, path: "/tmp/x", type: "directory" as const },
      cleanup: vi.fn(),
    }
    vi.mocked(resolveGitHubSource).mockReturnValue(handle)
    vi.mocked(applyCopy).mockReturnValue({ status: "synced" })

    await syncCommand.callback!({ _: {} })

    expect(resolveGitHubSource).toHaveBeenCalledWith(
      githubSpec.upstream,
      undefined,
    )
  })

  it("prompts for new token on auth_required (no existing tokens)", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({ githubTokens: {} })
    const handle = {
      source: { found: true, path: "/tmp/x", type: "directory" as const },
      cleanup: vi.fn(),
    }
    vi.mocked(resolveGitHubSource)
      .mockReturnValueOnce({
        error: "auth_required",
        repo: "owner/repo",
        message: "Authentication error",
      })
      .mockReturnValueOnce(handle)
    vi.mocked(p.password).mockResolvedValue("new-token")
    vi.mocked(applyCopy).mockReturnValue({ status: "synced" })

    await syncCommand.callback!({ _: {} })

    expect(p.note).toHaveBeenCalled()
    expect(p.password).toHaveBeenCalled()
    expect(saveGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        githubTokens: expect.objectContaining({
          "https://github.com/owner/repo": "new-token",
        }),
      }),
    )
    expect(resolveGitHubSource).toHaveBeenLastCalledWith(
      githubSpec.upstream,
      "new-token",
    )
    expect(handle.cleanup).toHaveBeenCalled()
  })

  it("offers existing tokens on auth_required when others exist", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({
      githubTokens: { "https://github.com/other/repo": "other-token" },
    })
    const handle = {
      source: { found: true, path: "/tmp/x", type: "directory" as const },
      cleanup: vi.fn(),
    }
    vi.mocked(resolveGitHubSource)
      .mockReturnValueOnce({
        error: "auth_required",
        repo: "owner/repo",
        message: "Authentication error",
      })
      .mockReturnValueOnce(handle)
    vi.mocked(p.select).mockResolvedValue("https://github.com/other/repo")
    vi.mocked(applyCopy).mockReturnValue({ status: "synced" })

    await syncCommand.callback!({ _: {} })

    expect(p.select).toHaveBeenCalled()
    expect(resolveGitHubSource).toHaveBeenLastCalledWith(
      githubSpec.upstream,
      "other-token",
    )
    expect(handle.cleanup).toHaveBeenCalled()
  })

  it("skips when user cancels token prompt", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({ githubTokens: {} })
    vi.mocked(resolveGitHubSource).mockReturnValue({
      error: "auth_required",
      repo: "owner/repo",
      message: "Authentication error",
    })
    vi.mocked(p.password).mockResolvedValue(Symbol("cancel") as never)
    vi.mocked(p.isCancel).mockReturnValue(true)

    await syncCommand.callback!({ _: {} })

    expect(resolveGitHubSource).toHaveBeenCalledTimes(1)
    expect(applyCopy).not.toHaveBeenCalled()
  })

  it("shows error and skip/retry prompt on auth_failed, skip", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({
      githubTokens: { "https://github.com/owner/repo": "bad-token" },
    })
    vi.mocked(resolveGitHubSource).mockReturnValue({
      error: "auth_failed",
      repo: "owner/repo",
      message: "Authentication error",
    })
    vi.mocked(p.select).mockResolvedValue("skip")

    await syncCommand.callback!({ _: {} })

    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining("Authentication failed"),
    )
    expect(resolveGitHubSource).toHaveBeenCalledTimes(1)
    expect(applyCopy).not.toHaveBeenCalled()
  })

  it("retries with new token on auth_failed, retry", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({
      githubTokens: { "https://github.com/owner/repo": "bad-token" },
    })
    const handle = {
      source: { found: true, path: "/tmp/x", type: "directory" as const },
      cleanup: vi.fn(),
    }
    vi.mocked(resolveGitHubSource)
      .mockReturnValueOnce({
        error: "auth_failed",
        repo: "owner/repo",
        message: "Authentication error",
      })
      .mockReturnValueOnce(handle)
    vi.mocked(p.select).mockResolvedValue("retry")
    vi.mocked(p.password).mockResolvedValue("new-token")
    vi.mocked(applyCopy).mockReturnValue({ status: "synced" })

    await syncCommand.callback!({ _: {} })

    expect(resolveGitHubSource).toHaveBeenCalledTimes(2)
    expect(resolveGitHubSource).toHaveBeenLastCalledWith(
      githubSpec.upstream,
      "new-token",
    )
    expect(applyCopy).toHaveBeenCalled()
    expect(handle.cleanup).toHaveBeenCalled()
    expect(p.log.success).toHaveBeenCalled()
  })

  it("calls cleanup even when applyCopy throws", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({
      githubTokens: { "https://github.com/owner/repo": "token" },
    })
    const handle = {
      source: { found: true, path: "/tmp/x", type: "directory" as const },
      cleanup: vi.fn(),
    }
    vi.mocked(resolveGitHubSource).mockReturnValue(handle)
    vi.mocked(applyCopy).mockImplementation(() => {
      throw new Error("boom")
    })

    await expect(syncCommand.callback!({ _: {} })).rejects.toThrow("boom")
    expect(handle.cleanup).toHaveBeenCalled()
  })

  it("retries on network_error and reports failure after exhausting retries", async () => {
    mockProject({ sync: [githubSpec] })
    mockGlobalConfig({ githubTokens: {} })
    vi.mocked(resolveGitHubSource).mockReturnValue({
      error: "network_error",
      repo: "owner/repo",
      message: "Could not resolve host",
    })

    await syncCommand.callback!({ _: {} })

    expect(resolveGitHubSource).toHaveBeenCalledTimes(1 + MAX_NETWORK_RETRIES)
    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining("Network error"),
    )
    expect(applyCopy).not.toHaveBeenCalled()
  })
})
