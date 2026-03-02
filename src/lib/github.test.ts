import { afterEach, describe, expect, it, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { cloneRepo } from "./github.js"

vi.mock("node:child_process")

afterEach(() => {
  vi.resetAllMocks()
})

describe("cloneRepo", () => {
  it("returns success with dir when clone succeeds", () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(""))
    const result = cloneRepo("owner/repo", "/tmp/dest")
    expect(result).toEqual({ success: true, dir: "/tmp/dest" })
  })

  it("returns failure with exitCode and stderr on error", () => {
    const err = Object.assign(new Error("Command failed"), {
      status: 128,
      stderr: Buffer.from("repository not found"),
    })
    vi.mocked(execFileSync).mockImplementation(() => {
      throw err
    })
    const result = cloneRepo("owner/repo", "/tmp/dest")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.exitCode).toBe(128)
      expect(result.stderr).toBe("repository not found")
    }
  })

  it("falls back to exitCode 1 when status is null", () => {
    const err = Object.assign(new Error("Command failed"), {
      status: null,
      stderr: Buffer.from(""),
    })
    vi.mocked(execFileSync).mockImplementation(() => {
      throw err
    })
    const result = cloneRepo("owner/repo", "/tmp/dest")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.exitCode).toBe(1)
  })

  it("includes token in URL when provided", () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(""))
    cloneRepo("owner/repo", "/tmp/dest", "my-token")
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining([
        "https://x-access-token:my-token@github.com/owner/repo.git",
      ]),
      expect.any(Object),
    )
  })

  it("omits auth when no token provided", () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(""))
    cloneRepo("owner/repo", "/tmp/dest")
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["https://github.com/owner/repo.git"]),
      expect.any(Object),
    )
  })

  it("passes 60s timeout", () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(""))
    cloneRepo("owner/repo", "/tmp/dest")
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "git",
      expect.any(Array),
      expect.objectContaining({ timeout: 60_000 }),
    )
  })
})
