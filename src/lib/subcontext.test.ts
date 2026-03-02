import { afterAll, describe, expect, it } from "vitest"
import { join } from "node:path"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  listSubcontexts,
  resolveSubcontextArg,
  nextSubcontextDirName,
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
