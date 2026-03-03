import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  computeGlobalRenames,
  formatDatetime,
  nextFilename,
  parseMaxSequence,
} from "./sequence.js"

const fixtureDir = join(import.meta.dirname, "../../test/fixtures/sequence")

describe("computeGlobalRenames", () => {
  const opts = { sequenceScheme: "000", sequenceSeparator: "." }

  it("assigns globally consecutive numbers across dirs", () => {
    const entries = [
      {
        dir: "/proj/features/001.sub-a/notes",
        files: ["001.intro.md", "003.design.md"],
      },
      {
        dir: "/proj/features/002.sub-b/notes",
        files: ["001.login.md", "002.auth.md"],
      },
    ]
    const renames = computeGlobalRenames(entries, opts)
    // Sort order: (1, intro), (1, login), (2, auth), (3, design)
    // → 001.intro stays, 001.login→002, 002.auth→003, 003.design→004
    expect(renames).toContainEqual({
      dir: "/proj/features/002.sub-b/notes",
      from: "001.login.md",
      to: "002.login.md",
    })
    expect(renames).toContainEqual({
      dir: "/proj/features/002.sub-b/notes",
      from: "002.auth.md",
      to: "003.auth.md",
    })
    expect(renames).toContainEqual({
      dir: "/proj/features/001.sub-a/notes",
      from: "003.design.md",
      to: "004.design.md",
    })
    expect(renames).not.toContainEqual(
      expect.objectContaining({ from: "001.intro.md" }),
    )
    expect(renames).toHaveLength(3)
  })

  it("sorts cross-dir by (seq, slug)", () => {
    const entries = [
      { dir: "/dir/b", files: ["001.banana.md"] },
      { dir: "/dir/a", files: ["001.apple.md"] },
    ]
    const renames = computeGlobalRenames(entries, opts)
    // apple < banana alphabetically, so apple gets pos 1 (no change), banana gets pos 2
    expect(renames).toContainEqual({
      dir: "/dir/b",
      from: "001.banana.md",
      to: "002.banana.md",
    })
    expect(renames).not.toContainEqual(
      expect.objectContaining({ from: "001.apple.md" }),
    )
  })

  it("skips non-sequenced files", () => {
    const entries = [
      { dir: "/dir/a", files: ["readme.md", "001.note.md"] },
      { dir: "/dir/b", files: ["002.other.md"] },
    ]
    const renames = computeGlobalRenames(entries, opts)
    expect(renames.every((r) => r.from !== "readme.md")).toBe(true)
    expect(renames.every((r) => r.to !== "readme.md")).toBe(true)
  })

  it("returns empty array when no renames needed", () => {
    const entries = [
      { dir: "/dir/a", files: ["001.first.md"] },
      { dir: "/dir/b", files: ["002.second.md"] },
    ]
    expect(computeGlobalRenames(entries, opts)).toEqual([])
  })

  it("handles empty entries array", () => {
    expect(computeGlobalRenames([], opts)).toEqual([])
  })

  it("handles entries with empty file lists", () => {
    const entries = [
      { dir: "/dir/a", files: ["001.note.md"] },
      { dir: "/dir/b", files: [] },
    ]
    expect(computeGlobalRenames(entries, opts)).toEqual([])
  })
})

describe("formatDatetime", () => {
  it("formats a date as YYYYMMDDHHmmss", () => {
    const date = new Date(2026, 1, 24, 9, 5, 3) // months are 0-indexed
    expect(formatDatetime(date)).toBe("20260224090503")
  })
})

describe("parseMaxSequence", () => {
  it("returns max numeric prefix from files", () => {
    const files = readdirSync(join(fixtureDir, "counter-three-digit"))
    expect(parseMaxSequence(files, ".")).toBe(3)
  })

  it("works with custom separator", () => {
    const files = readdirSync(join(fixtureDir, "counter-custom-sep"))
    expect(parseMaxSequence(files, " - ")).toBe(2)
  })

  it("returns 0 for empty directory", () => {
    const files = readdirSync(join(fixtureDir, "empty"))
    expect(parseMaxSequence(files, ".")).toBe(0)
  })

  it("returns 0 when no files match pattern", () => {
    expect(parseMaxSequence(["readme.md", "notes.txt"], ".")).toBe(0)
  })
})

describe("nextFilename", () => {
  it("returns slug.md for 'none' scheme", () => {
    const doctype = {
      dir: "/tmp",
      sequenceScheme: "none" as const,
      sequenceSeparator: ".",
    }
    expect(nextFilename([], doctype, "my-note")).toBe("my-note.md")
  })

  it("returns counter-prefixed filename for numeric scheme", () => {
    const files = readdirSync(join(fixtureDir, "counter-three-digit"))
    const doctype = {
      dir: "/tmp",
      sequenceScheme: "000",
      sequenceSeparator: ".",
    }
    expect(nextFilename(files, doctype, "new-note")).toBe("004.new-note.md")
  })

  it("pads to scheme length", () => {
    const doctype = {
      dir: "/tmp",
      sequenceScheme: "0000",
      sequenceSeparator: ".",
    }
    expect(nextFilename(["0001.old.md"], doctype, "new")).toBe("0002.new.md")
  })

  it("starts at 001 for empty dir with numeric scheme", () => {
    const doctype = {
      dir: "/tmp",
      sequenceScheme: "000",
      sequenceSeparator: ".",
    }
    expect(nextFilename([], doctype, "first")).toBe("001.first.md")
  })

  it("uses custom separator", () => {
    const files = readdirSync(join(fixtureDir, "counter-custom-sep"))
    const doctype = {
      dir: "/tmp",
      sequenceScheme: "000",
      sequenceSeparator: " - ",
    }
    expect(nextFilename(files, doctype, "third-note")).toBe(
      "003 - third-note.md",
    )
  })

  it("returns datetime-prefixed filename for datetime scheme", () => {
    const doctype = {
      dir: "/tmp",
      sequenceScheme: "datetime" as const,
      sequenceSeparator: ".",
    }
    const result = nextFilename([], doctype, "my-note")
    expect(result).toMatch(/^\d{14}\.my-note\.md$/)
  })
})
