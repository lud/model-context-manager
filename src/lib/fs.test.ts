import { mkdtempSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as cli from "./cli.js"
import {
  readdirSyncOrAbort,
  readFileSyncOrAbort,
  writeFileSyncOrAbort,
} from "./fs.js"

vi.mock("./cli.js")

const fixtureDir = resolve(__dirname, "../../test/fixtures/sequence")

beforeEach(() => {
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("readdirSync", () => {
  it("returns directory contents on success", () => {
    const files = readdirSyncOrAbort(join(fixtureDir, "empty"))
    expect(Array.isArray(files)).toBe(true)
  })

  it("aborts with 'directory not found' for missing directory", () => {
    expect(() => readdirSyncOrAbort("/nonexistent/path/abc123")).toThrow(
      "abortError",
    )
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("directory not found"),
    )
  })

  it("includes the path in the error message", () => {
    const path = "/nonexistent/path/abc123"
    expect(() => readdirSyncOrAbort(path)).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(expect.stringContaining(path))
  })

  it("returns Dirent[] when withFileTypes: true", () => {
    const entries = readdirSyncOrAbort(
      join(fixtureDir, "counter-three-digit"),
      {
        withFileTypes: true,
      },
    )
    expect(entries[0]).toHaveProperty("name")
    expect(typeof entries[0].isFile).toBe("function")
  })
})

describe("readFileSync", () => {
  it("returns file contents on success", () => {
    const files = readdirSyncOrAbort(join(fixtureDir, "counter-three-digit"))
    const content = readFileSyncOrAbort(
      join(fixtureDir, "counter-three-digit", files[0]),
      "utf-8",
    )
    expect(typeof content).toBe("string")
  })

  it("aborts with 'file not found' for missing file", () => {
    expect(() => readFileSyncOrAbort("/nonexistent/file.txt", "utf-8")).toThrow(
      "abortError",
    )
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("file not found"),
    )
  })

  it("includes the path in the error message", () => {
    const path = "/nonexistent/file.txt"
    expect(() => readFileSyncOrAbort(path, "utf-8")).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(expect.stringContaining(path))
  })
})

describe("writeFileSync", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mcm-fs-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("writes a file successfully", () => {
    const filePath = join(tempDir, "test.txt")
    writeFileSyncOrAbort(filePath, "hello")
    const content = readFileSyncOrAbort(filePath, "utf-8")
    expect(content).toBe("hello")
  })

  it("aborts with 'directory not found' when parent dir is missing", () => {
    const filePath = join(tempDir, "nonexistent-dir", "test.txt")
    expect(() => writeFileSyncOrAbort(filePath, "data")).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("directory not found"),
    )
  })

  it("includes the path in the error message", () => {
    const filePath = join(tempDir, "nonexistent-dir", "test.txt")
    expect(() => writeFileSyncOrAbort(filePath, "data")).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining(filePath),
    )
  })
})
