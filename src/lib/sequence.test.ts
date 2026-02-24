import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { formatDatetime, nextFilename, parseMaxSequence } from "./sequence.js"

const fixtureDir = join(import.meta.dirname, "../../test/fixtures/sequence")

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
    const doctype = { dir: "/tmp", sequenceScheme: "none" as const, sequenceSeparator: "." }
    expect(nextFilename([], doctype, "my-note")).toBe("my-note.md")
  })

  it("returns counter-prefixed filename for numeric scheme", () => {
    const files = readdirSync(join(fixtureDir, "counter-three-digit"))
    const doctype = { dir: "/tmp", sequenceScheme: "000", sequenceSeparator: "." }
    expect(nextFilename(files, doctype, "new-note")).toBe("004.new-note.md")
  })

  it("pads to scheme length", () => {
    const doctype = { dir: "/tmp", sequenceScheme: "0000", sequenceSeparator: "." }
    expect(nextFilename(["0001.old.md"], doctype, "new")).toBe("0002.new.md")
  })

  it("starts at 001 for empty dir with numeric scheme", () => {
    const doctype = { dir: "/tmp", sequenceScheme: "000", sequenceSeparator: "." }
    expect(nextFilename([], doctype, "first")).toBe("001.first.md")
  })

  it("uses custom separator", () => {
    const files = readdirSync(join(fixtureDir, "counter-custom-sep"))
    const doctype = { dir: "/tmp", sequenceScheme: "000", sequenceSeparator: " - " }
    expect(nextFilename(files, doctype, "third-note")).toBe("003 - third-note.md")
  })

  it("returns datetime-prefixed filename for datetime scheme", () => {
    const doctype = { dir: "/tmp", sequenceScheme: "datetime" as const, sequenceSeparator: "." }
    const result = nextFilename([], doctype, "my-note")
    expect(result).toMatch(/^\d{14}\.my-note\.md$/)
  })
})
