import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolveLocalSource, resolveGitHubSource, applyCopy } from "./sync.js"
import type { SyncReporter, SyncResult } from "./sync.js"
import type { LocalFsUpstream, ResolvedSyncSpec } from "./project.js"
import { cloneRepo } from "./github.js"

vi.mock("./github.js")

const workspace = mkdtempSync(join(tmpdir(), "mcm-test-sync-"))
const fixtureDir = join(import.meta.dirname, "../../test/fixtures/sync")

let targetDir: string
let reporter: SyncReporter & { copied: string[]; deleted: string[] }

beforeEach(() => {
  targetDir = join(
    workspace,
    `target-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(targetDir, { recursive: true })
  reporter = {
    copied: [],
    deleted: [],
    onCopied(path) {
      this.copied.push(path)
    },
    onDeleted(path) {
      this.deleted.push(path)
    },
  }
})

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

afterEach(() => {
  vi.resetAllMocks()
})

function makeSpec(
  overrides: Partial<ResolvedSyncSpec> & {
    upstream?: ResolvedSyncSpec["upstream"]
    local?: string
  },
): ResolvedSyncSpec {
  return {
    upstream: { kind: "localfs", path: "/nonexistent" },
    local: join(targetDir, "dest"),
    mode: "receive_merge",
    ...overrides,
  }
}

function syncLocal(
  overrides: Partial<ResolvedSyncSpec> & {
    upstream?: ResolvedSyncSpec["upstream"]
    local?: string
  },
): SyncResult {
  const spec = makeSpec(overrides)
  const handle = resolveLocalSource(spec.upstream as LocalFsUpstream)
  return applyCopy(handle.source, spec.local, spec.mode, reporter)
}

// Rule 1: source doesn't exist + receive_merge → skipped
describe("rule 1: source missing + receive_merge", () => {
  it("returns skipped", () => {
    const result = syncLocal({
      upstream: { kind: "localfs", path: "/does/not/exist" },
    })
    expect(result.status).toBe("skipped")
  })
})

// Rule 2: source doesn't exist + receive_mirror + target exists → delete target
describe("rule 2: source missing + receive_mirror + target exists", () => {
  it("deletes target and returns deleted_target", () => {
    const localPath = join(targetDir, "to-delete")
    writeFileSync(localPath, "old")

    const result = syncLocal({
      upstream: { kind: "localfs", path: "/does/not/exist" },
      local: localPath,
      mode: "receive_mirror",
    })
    expect(result.status).toBe("deleted_target")
    expect(existsSync(localPath)).toBe(false)
    expect(reporter.deleted.length).toBeGreaterThan(0)
  })
})

// Rule 3: source doesn't exist + receive_mirror + no target → skipped
describe("rule 3: source missing + receive_mirror + no target", () => {
  it("returns skipped", () => {
    const result = syncLocal({
      upstream: { kind: "localfs", path: "/does/not/exist" },
      local: join(targetDir, "nonexistent"),
      mode: "receive_mirror",
    })
    expect(result.status).toBe("skipped")
  })
})

// Rule 4: source is dir, target is file → error
describe("rule 4: source dir, target file", () => {
  it("returns error", () => {
    const localPath = join(targetDir, "a-file")
    writeFileSync(localPath, "content")

    const result = syncLocal({
      upstream: { kind: "localfs", path: join(fixtureDir, "source-dir") },
      local: localPath,
    })
    expect(result.status).toBe("error")
  })
})

// Rule 5: source is file → copy to local
describe("rule 5: source is file", () => {
  it("copies file to local", () => {
    const localPath = join(targetDir, "copied.txt")
    const result = syncLocal({
      upstream: {
        kind: "localfs",
        path: join(fixtureDir, "source-file.txt"),
      },
      local: localPath,
    })
    expect(result.status).toBe("synced")
    expect(readFileSync(localPath, "utf-8")).toBe("source file content\n")
    expect(reporter.copied).toContain(localPath)
  })

  it("creates parent directories for file target", () => {
    const localPath = join(targetDir, "deep", "nested", "copied.txt")
    const result = syncLocal({
      upstream: {
        kind: "localfs",
        path: join(fixtureDir, "source-file.txt"),
      },
      local: localPath,
    })
    expect(result.status).toBe("synced")
    expect(readFileSync(localPath, "utf-8")).toBe("source file content\n")
  })
})

// Rule 6: source is dir, target doesn't exist → create dir, copy contents
describe("rule 6: source dir, target missing", () => {
  it("creates target and copies contents", () => {
    const localPath = join(targetDir, "new-dir")
    const result = syncLocal({
      upstream: { kind: "localfs", path: join(fixtureDir, "source-dir") },
      local: localPath,
    })
    expect(result.status).toBe("synced")
    expect(readFileSync(join(localPath, "file-a.txt"), "utf-8")).toBe(
      "file-a content\n",
    )
    expect(readFileSync(join(localPath, "file-b.txt"), "utf-8")).toBe(
      "file-b content\n",
    )
  })
})

// Rule 7: source is dir, target is dir, receive_merge → copy all, no deletes
describe("rule 7: source dir, target dir, receive_merge", () => {
  it("copies files without deleting extras", () => {
    const localPath = join(targetDir, "merge-dir")
    mkdirSync(localPath, { recursive: true })
    writeFileSync(join(localPath, "extra.txt"), "should stay")

    const result = syncLocal({
      upstream: { kind: "localfs", path: join(fixtureDir, "source-dir") },
      local: localPath,
      mode: "receive_merge",
    })
    expect(result.status).toBe("synced")
    expect(readFileSync(join(localPath, "file-a.txt"), "utf-8")).toBe(
      "file-a content\n",
    )
    expect(readFileSync(join(localPath, "extra.txt"), "utf-8")).toBe(
      "should stay",
    )
  })
})

// Rule 8: source is dir, target is dir, receive_mirror → copy all + delete extras
describe("rule 8: source dir, target dir, receive_mirror", () => {
  it("copies files and deletes extras", () => {
    const localPath = join(targetDir, "mirror-dir")
    mkdirSync(localPath, { recursive: true })
    writeFileSync(join(localPath, "extra.txt"), "should be deleted")

    const result = syncLocal({
      upstream: { kind: "localfs", path: join(fixtureDir, "source-dir") },
      local: localPath,
      mode: "receive_mirror",
    })
    expect(result.status).toBe("synced")
    expect(readFileSync(join(localPath, "file-a.txt"), "utf-8")).toBe(
      "file-a content\n",
    )
    expect(existsSync(join(localPath, "extra.txt"))).toBe(false)
    expect(reporter.deleted.length).toBeGreaterThan(0)
  })
})

// Nested directory structures
describe("nested directories", () => {
  it("copies nested subdirectories recursively", () => {
    syncLocal({
      upstream: { kind: "localfs", path: join(fixtureDir, "source-dir") },
      local: join(targetDir, "nested-test"),
    })
    expect(
      readFileSync(
        join(targetDir, "nested-test", "subdir", "nested.txt"),
        "utf-8",
      ),
    ).toBe("nested content\n")
  })
})

// Empty source directory
describe("empty source directory", () => {
  it("creates empty target directory", () => {
    const emptySource = join(workspace, "empty-source")
    mkdirSync(emptySource, { recursive: true })
    const localPath = join(targetDir, "empty-target")

    const result = syncLocal({
      upstream: { kind: "localfs", path: emptySource },
      local: localPath,
    })
    expect(result.status).toBe("synced")
    expect(existsSync(localPath)).toBe(true)
    expect(readdirSync(localPath)).toEqual([])
  })
})

describe("resolveGitHubSource", () => {
  const upstream = { kind: "github" as const, repo: "owner/repo", path: "docs" }

  it("returns auth_required when clone fails without token", () => {
    vi.mocked(cloneRepo).mockReturnValue({
      success: false,
      exitCode: 128,
      stderr: "repository not found",
    })
    const result = resolveGitHubSource(upstream)
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toBe("auth_required")
      expect(result.repo).toBe("owner/repo")
    }
  })

  it("returns auth_failed when clone fails with token", () => {
    vi.mocked(cloneRepo).mockReturnValue({
      success: false,
      exitCode: 128,
      stderr: "repository not found",
    })
    const result = resolveGitHubSource(upstream, "my-token")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toBe("auth_failed")
      expect(result.repo).toBe("owner/repo")
    }
  })

  it("returns network_error when clone fails with network stderr", () => {
    vi.mocked(cloneRepo).mockReturnValue({
      success: false,
      exitCode: 128,
      stderr:
        "fatal: unable to access 'https://...': Could not resolve host: github.com",
    })
    const result = resolveGitHubSource(upstream)
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toBe("network_error")
    }
  })

  it("returns source.found=false when clone succeeds but path not found", () => {
    vi.mocked(cloneRepo).mockReturnValue({ success: true, dir: "ignored" })
    const result = resolveGitHubSource(upstream)
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.source.found).toBe(false)
      result.cleanup?.()
    }
  })
})
