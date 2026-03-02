import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as cli from "../lib/cli.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { computeRenames, parseSeqPrefix, seqfixCommand } from "./seqfix.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")

const fixtureDir = join(import.meta.dirname, "../../test/fixtures/seqfix")

// Temp workspace for tests that actually rename files
const workspace = mkdtempSync(join(tmpdir(), "mcm-test-seqfix-"))

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
  vi.mocked(cli.abort).mockImplementation(() => {
    throw new Error("abort")
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// parseSeqPrefix
// ---------------------------------------------------------------------------

describe("parseSeqPrefix", () => {
  it("parses a zero-padded prefix", () => {
    expect(parseSeqPrefix("007.foo.md", ".")).toEqual({
      seq: 7,
      slug: "foo.md",
    })
  })

  it("parses an unpadded prefix", () => {
    expect(parseSeqPrefix("1.foo.md", ".")).toEqual({ seq: 1, slug: "foo.md" })
  })

  it("treats '07' and '00007' as the same integer", () => {
    expect(parseSeqPrefix("07.foo.md", ".")?.seq).toBe(7)
    expect(parseSeqPrefix("00007.foo.md", ".")?.seq).toBe(7)
  })

  it("returns null for a filename without a separator", () => {
    expect(parseSeqPrefix("readme.txt", ".")).toBeNull()
  })

  it("returns null when prefix is not purely numeric", () => {
    expect(parseSeqPrefix("abc.foo.md", ".")).toBeNull()
  })

  it("returns null when prefix starts at position 0 (empty prefix)", () => {
    expect(parseSeqPrefix(".foo.md", ".")).toBeNull()
  })

  it("works with a custom separator", () => {
    expect(parseSeqPrefix("003 - note.md", " - ")).toEqual({
      seq: 3,
      slug: "note.md",
    })
  })
})

// ---------------------------------------------------------------------------
// computeRenames
// ---------------------------------------------------------------------------

describe("computeRenames", () => {
  const doctype = { sequenceScheme: "000", sequenceSeparator: "." }

  it("returns renames for duplicates and gaps", () => {
    const files = [
      "001.alpha.md",
      "07.beta.md",
      "007.gamma.md",
      "010.delta.md",
      "readme.txt",
    ]
    const renames = computeRenames(files, doctype)
    expect(renames).toEqual([
      { from: "07.beta.md", to: "002.beta.md" },
      { from: "007.gamma.md", to: "003.gamma.md" },
      { from: "010.delta.md", to: "004.delta.md" },
    ])
  })

  it("returns empty array when nothing needs renaming", () => {
    const files = ["001.foo.md", "002.bar.md"]
    expect(computeRenames(files, doctype)).toEqual([])
  })

  it("leaves unsequenced files untouched", () => {
    const files = ["readme.txt", "001.foo.md"]
    const renames = computeRenames(files, doctype)
    expect(renames.every((r) => r.from !== "readme.txt")).toBe(true)
    expect(renames.every((r) => r.to !== "readme.txt")).toBe(true)
  })

  it("breaks ties between duplicate seq numbers alphabetically by slug", () => {
    // seq=5: "banana.md" and "apple.md" — "apple" sorts first
    const files = ["005.banana.md", "05.apple.md"]
    const renames = computeRenames(files, doctype)
    // pos 1 → apple, pos 2 → banana
    expect(renames).toContainEqual({ from: "05.apple.md", to: "001.apple.md" })
    expect(renames).toContainEqual({
      from: "005.banana.md",
      to: "002.banana.md",
    })
  })

  it("applies new scheme padding width", () => {
    const wideDoctype = { sequenceScheme: "0000", sequenceSeparator: "." }
    const files = ["001.foo.md", "002.bar.md"]
    const renames = computeRenames(files, wideDoctype)
    expect(renames).toEqual([
      { from: "001.foo.md", to: "0001.foo.md" },
      { from: "002.bar.md", to: "0002.bar.md" },
    ])
  })

  it("handles empty file list", () => {
    expect(computeRenames([], doctype)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// seqfixCommand — dry-run (no fs changes)
// ---------------------------------------------------------------------------

describe("seqfixCommand (dry-run)", () => {
  it("prints renames and advises -f when changes are needed", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "mixed"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    seqfixCommand.callback!({
      _: { doctype: "notes" },
      flags: { force: false },
    })

    expect(cli.info).toHaveBeenCalledWith(expect.stringContaining("07.beta.md"))
    expect(cli.info).toHaveBeenCalledWith(expect.stringContaining("-f"))
    expect(cli.success).not.toHaveBeenCalled()
  })

  it("prints 'Nothing to rename' when all files are correct", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "correct"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    seqfixCommand.callback!({
      _: { doctype: "notes" },
      flags: { force: false },
    })

    expect(cli.info).toHaveBeenCalledWith("Nothing to rename.")
  })

  it("aborts for unknown doctype", () => {
    mockProject({ doctypes: {} })

    expect(() =>
      seqfixCommand.callback!({
        _: { doctype: "unknown" },
        flags: { force: false },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith("Unknown doctype: unknown")
  })

  it("aborts when sequenceScheme is 'none'", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: "/tmp",
          sequenceScheme: "none",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    expect(() =>
      seqfixCommand.callback!({
        _: { doctype: "notes" },
        flags: { force: false },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining('"none"'),
    )
  })

  it("aborts when sequenceScheme is 'datetime'", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: "/tmp",
          sequenceScheme: "datetime",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    expect(() =>
      seqfixCommand.callback!({
        _: { doctype: "notes" },
        flags: { force: false },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining('"datetime"'),
    )
  })
})

// ---------------------------------------------------------------------------
// seqfixCommand — --force (actual fs changes)
// ---------------------------------------------------------------------------

describe("seqfixCommand (--force)", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(workspace, "run-"))
    cpSync(join(fixtureDir, "mixed"), tmpDir, { recursive: true })
  })

  it("renames files and reports success", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tmpDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    seqfixCommand.callback!({ _: { doctype: "notes" }, flags: { force: true } })

    expect(cli.success).toHaveBeenCalledWith(
      expect.stringContaining("Renamed 3 file(s)"),
    )

    const files = readdirSync(tmpDir).sort()
    expect(files).toContain("001.alpha.md")
    expect(files).toContain("002.beta.md")
    expect(files).toContain("003.gamma.md")
    expect(files).toContain("004.delta.md")
    expect(files).toContain("readme.txt")
    expect(files).not.toContain("07.beta.md")
    expect(files).not.toContain("007.gamma.md")
    expect(files).not.toContain("010.delta.md")
  })
})
