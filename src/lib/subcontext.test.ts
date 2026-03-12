import { afterAll, describe, expect, it } from "vitest"
import { join } from "node:path"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  listSubcontexts,
  resolveSubcontextArg,
  nextSubcontextDirName,
  listBriefFiles,
  detectBriefMismatches,
} from "./subcontext.js"

const workspace = mkdtempSync(join(tmpdir(), "mcm-test-subcontext-"))

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

describe("listSubcontexts", () => {
  it("returns sorted directory names", () => {
    const dir = join(workspace, "list-sorted")
    mkdirSync(join(dir, "002.beta"), { recursive: true })
    mkdirSync(join(dir, "001.alpha"), { recursive: true })
    mkdirSync(join(dir, "003.gamma"), { recursive: true })

    expect(listSubcontexts(dir)).toEqual(["001.alpha", "002.beta", "003.gamma"])
  })

  it("returns empty array for nonexistent directory", () => {
    expect(listSubcontexts(join(workspace, "nope"))).toEqual([])
  })

  it("ignores files, only returns directories", () => {
    const dir = join(workspace, "list-dirs-only")
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, "001.sub"))
    require("node:fs").writeFileSync(join(dir, "not-a-dir.txt"), "hi")

    expect(listSubcontexts(dir)).toEqual(["001.sub"])
  })
})

describe("resolveSubcontextArg", () => {
  const dir = join(workspace, "resolve")

  it("resolves by number", () => {
    mkdirSync(join(dir, "001.alpha"), { recursive: true })
    mkdirSync(join(dir, "002.beta"), { recursive: true })

    expect(resolveSubcontextArg(dir, "1")).toBe("001.alpha")
    expect(resolveSubcontextArg(dir, "2")).toBe("002.beta")
  })

  it("returns not-found for unknown number", () => {
    expect(resolveSubcontextArg(dir, "99")).toEqual({ error: "not-found" })
  })

  it("fuzzy matches single result", () => {
    expect(resolveSubcontextArg(dir, "alp")).toBe("001.alpha")
  })

  it("returns not-found for no fuzzy match", () => {
    expect(resolveSubcontextArg(dir, "zzz")).toEqual({ error: "not-found" })
  })

  it("returns multiple for ambiguous fuzzy match", () => {
    // Both "001.alpha" and "002.beta" contain "a"
    const result = resolveSubcontextArg(dir, "a")
    expect(result).toEqual({
      error: "multiple",
      names: ["001.alpha", "002.beta"],
    })
  })

  it("fuzzy match is case-insensitive", () => {
    expect(resolveSubcontextArg(dir, "ALPHA")).toBe("001.alpha")
  })

  it("fuzzy match ignores spaces in query", () => {
    expect(resolveSubcontextArg(dir, "al pha")).toBe("001.alpha")
  })
})

describe("nextSubcontextDirName", () => {
  it("returns 001 when no existing dirs", () => {
    expect(nextSubcontextDirName([], "my-feature")).toBe("001.my-feature")
  })

  it("increments from highest existing number", () => {
    expect(nextSubcontextDirName(["001.first", "002.second"], "third")).toBe(
      "003.third",
    )
  })

  it("handles gaps in numbering", () => {
    expect(nextSubcontextDirName(["001.first", "005.fifth"], "next")).toBe(
      "006.next",
    )
  })
})

describe("listBriefFiles", () => {
  const fixtureDir = join(
    import.meta.dirname,
    "../../test/fixtures/doctypes/multi-subcontext/features",
  )

  it("returns brief files for subcontext dirs that have them", () => {
    const result = listBriefFiles(fixtureDir)
    // 001.feature-a and 002.feature-b have briefs, 003.feature-c does not
    expect(result).toHaveLength(3)
    expect(result[0].dir).toContain("001.feature-a")
    expect(result[0].files).toEqual(["001.feature-a.md"])
    expect(result[1].dir).toContain("002.feature-b")
    expect(result[1].files).toEqual(["002.feature-b.md"])
    expect(result[2].dir).toContain("003.feature-c")
    expect(result[2].files).toEqual([])
  })

  it("returns empty array for nonexistent dir", () => {
    expect(listBriefFiles("/nonexistent")).toEqual([])
  })

  it("returns empty files when dir has no matching brief", () => {
    const dir = join(workspace, "no-brief")
    mkdirSync(join(dir, "001.test"), { recursive: true })
    writeFileSync(join(dir, "001.test", "other.md"), "")

    const result = listBriefFiles(dir)
    expect(result).toHaveLength(1)
    expect(result[0].files).toEqual([])
  })
})

describe("detectBriefMismatches", () => {
  it("returns empty when all briefs match", () => {
    const dir = join(workspace, "matching")
    mkdirSync(join(dir, "001.foo"), { recursive: true })
    writeFileSync(join(dir, "001.foo", "001.foo.md"), "")

    expect(detectBriefMismatches(dir)).toEqual([])
  })

  it("detects mismatch when brief slug differs from dir slug", () => {
    const dir = join(workspace, "mismatched")
    mkdirSync(join(dir, "002.new-name"), { recursive: true })
    writeFileSync(join(dir, "002.new-name", "001.old-name.md"), "")

    const mismatches = detectBriefMismatches(dir)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0].dir).toBe("002.new-name")
    expect(mismatches[0].expected).toBe("002.new-name.md")
    expect(mismatches[0].found).toBe("001.old-name.md")
  })

  it("returns empty for dirs with no .md files", () => {
    const dir = join(workspace, "nomd")
    mkdirSync(join(dir, "001.bar"), { recursive: true })

    expect(detectBriefMismatches(dir)).toEqual([])
  })
})
