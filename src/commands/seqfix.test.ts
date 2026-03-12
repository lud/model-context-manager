import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { DoctypeRole } from "../lib/project.js"
import { computeRenames, parseSeqPrefix, seqfixCommand } from "./seqfix.js"
import { createTestWorkspace } from "../lib/test-workspace.js"

const multiSubcontextFixture = join(
  import.meta.dirname,
  "../../test/fixtures/doctypes/multi-subcontext",
)

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")
vi.mock("../lib/global-config.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../lib/global-config.js")>()
  return {
    ...orig,
    getCurrentSubcontext: vi.fn(),
    setCurrentSubcontext: vi.fn(),
  }
})

import {
  getCurrentSubcontext,
  setCurrentSubcontext,
} from "../lib/global-config.js"

const fixtureDir = join(import.meta.dirname, "../../test/fixtures/seqfix")

const workspace = createTestWorkspace("seqfix")

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
          role: DoctypeRole.Regular,
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
          role: DoctypeRole.Regular,
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
          role: DoctypeRole.Regular,
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
          role: DoctypeRole.Regular,
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
// seqfixCommand — inSubcontext, dry-run
// ---------------------------------------------------------------------------

describe("seqfixCommand (inSubcontext, dry-run)", () => {
  it("shows global renames with paths relative to subcontexts dir", () => {
    // fixture: 001.feature-a/notes: 001.intro.md, 003.design.md
    //          002.feature-b/notes: 001.login.md, 002.auth.md
    // sort: (1,intro), (1,login), (2,auth), (3,design)
    // renames: 001.login→002, 002.auth→003, 003.design→004
    mockProject({
      projectDir: multiSubcontextFixture,
      currentSubcontext: "001.feature-a",
      doctypes: {
        features: {
          dir: join(multiSubcontextFixture, "features"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          dir: join(multiSubcontextFixture, "features/001.feature-a/notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
      },
      rawConfig: {
        extend: false,
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          notes: {
            dir: "notes",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: ["notes"],
      },
    })

    seqfixCommand.callback!({
      _: { doctype: "notes" },
      flags: { force: false },
    })

    // Should show full relative path on both sides, e.g.:
    // 001.feature-a/notes/003.design.md → 001.feature-a/notes/004.design.md
    expect(cli.info).toHaveBeenCalledWith(
      "001.feature-a/notes/003.design.md → 001.feature-a/notes/004.design.md",
    )
    expect(cli.info).toHaveBeenCalledWith(expect.stringContaining("-f"))
    expect(cli.success).not.toHaveBeenCalled()
  })

  it("prints 'Nothing to rename' when all files are already in order globally", () => {
    mockProject({
      projectDir: multiSubcontextFixture,
      currentSubcontext: "001.feature-a",
      doctypes: {
        features: {
          dir: join(multiSubcontextFixture, "nonexistent-features"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          dir: join(multiSubcontextFixture, "features/001.feature-a/notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
      },
      rawConfig: {
        extend: false,
        doctypes: {
          features: {
            dir: "nonexistent-features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          notes: {
            dir: "notes",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: ["notes"],
      },
    })

    seqfixCommand.callback!({
      _: { doctype: "notes" },
      flags: { force: false },
    })

    expect(cli.info).toHaveBeenCalledWith("Nothing to rename.")
  })
})

// ---------------------------------------------------------------------------
// seqfixCommand — inSubcontext, --force
// ---------------------------------------------------------------------------

describe("seqfixCommand (inSubcontext, --force)", () => {
  it("renames files globally across subcontexts", () => {
    const base = workspace.dir("sub-force-run")
    const sub1Notes = join(base, "features/001.feature-a/notes")
    const sub2Notes = join(base, "features/002.feature-b/notes")
    mkdirSync(sub1Notes, { recursive: true })
    mkdirSync(sub2Notes, { recursive: true })
    writeFileSync(join(sub1Notes, "001.intro.md"), "")
    writeFileSync(join(sub1Notes, "003.design.md"), "")
    writeFileSync(join(sub2Notes, "001.login.md"), "")
    writeFileSync(join(sub2Notes, "002.auth.md"), "")

    mockProject({
      projectDir: base,
      currentSubcontext: "001.feature-a",
      doctypes: {
        features: {
          dir: join(base, "features"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          dir: sub1Notes,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
      },
      rawConfig: {
        extend: false,
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          notes: {
            dir: "notes",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: ["notes"],
      },
    })

    seqfixCommand.callback!({ _: { doctype: "notes" }, flags: { force: true } })

    expect(cli.success).toHaveBeenCalledWith(
      expect.stringContaining("Renamed 3 file(s)"),
    )

    // sort: (1,intro)→001, (1,login)→002, (2,auth)→003, (3,design)→004
    expect(readdirSync(sub1Notes).sort()).toContain("001.intro.md")
    expect(readdirSync(sub1Notes).sort()).toContain("004.design.md")
    expect(readdirSync(sub1Notes).sort()).not.toContain("003.design.md")
    expect(readdirSync(sub2Notes).sort()).toContain("002.login.md")
    expect(readdirSync(sub2Notes).sort()).toContain("003.auth.md")
    expect(readdirSync(sub2Notes).sort()).not.toContain("001.login.md")
    expect(readdirSync(sub2Notes).sort()).not.toContain("002.auth.md")
  })
})

// ---------------------------------------------------------------------------
// seqfixCommand — --force (actual fs changes)
// ---------------------------------------------------------------------------

describe("seqfixCommand (--force)", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = workspace.copyFixture(join(fixtureDir, "mixed"))
  })

  it("renames files and reports success", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tmpDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
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

// ---------------------------------------------------------------------------
// seqfixCommand — subcontext doctype, --force
// ---------------------------------------------------------------------------

describe("seqfixCommand (subcontext doctype, --force)", () => {
  it("renumbers directories and renames brief files inside", () => {
    const base = workspace.copyFixture(multiSubcontextFixture, "sub-seqfix")
    const featuresDir = join(base, "features")

    mockProject({
      projectDir: base,
      currentSubcontext: false,
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
      },
      rawConfig: {
        extend: false,
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: [],
      },
    })

    // Delete 002.feature-b to create a gap: 001, 003 remain
    const { rmSync } = require("node:fs")
    rmSync(join(featuresDir, "002.feature-b"), { recursive: true, force: true })

    seqfixCommand.callback!({
      _: { doctype: "features" },
      flags: { force: true },
    })

    expect(cli.success).toHaveBeenCalledWith(expect.stringContaining("dir(s)"))

    // 003.feature-c should have been renumbered to 002.feature-c
    const dirs = readdirSync(featuresDir).sort()
    expect(dirs).toContain("001.feature-a")
    expect(dirs).toContain("002.feature-c")
    expect(dirs).not.toContain("003.feature-c")
  })

  it("renames brief files to match new directory names", () => {
    const base = workspace.copyFixture(multiSubcontextFixture, "sub-briefs")
    const featuresDir = join(base, "features")

    mockProject({
      projectDir: base,
      currentSubcontext: false,
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
      },
      rawConfig: {
        extend: false,
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: [],
      },
    })

    // Delete 001.feature-a so the remaining two (002, 003) get renumbered to 001, 002
    const { rmSync } = require("node:fs")
    rmSync(join(featuresDir, "001.feature-a"), { recursive: true, force: true })

    seqfixCommand.callback!({
      _: { doctype: "features" },
      flags: { force: true },
    })

    // 002.feature-b → 001.feature-b: brief inside should also be renamed
    expect(
      existsSync(join(featuresDir, "001.feature-b", "001.feature-b.md")),
    ).toBe(true)
    expect(
      existsSync(join(featuresDir, "001.feature-b", "002.feature-b.md")),
    ).toBe(false)
  })

  it("updates current subcontext when the active one is renamed", () => {
    const base = workspace.copyFixture(multiSubcontextFixture, "sub-current")
    const featuresDir = join(base, "features")

    vi.mocked(getCurrentSubcontext).mockReturnValue("003.feature-c")

    mockProject({
      projectDir: base,
      currentSubcontext: "003.feature-c",
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
      },
      rawConfig: {
        extend: false,
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: [],
      },
    })

    // Remove 002.feature-b to create a gap so 003 → 002
    const { rmSync } = require("node:fs")
    rmSync(join(featuresDir, "002.feature-b"), { recursive: true, force: true })

    seqfixCommand.callback!({
      _: { doctype: "features" },
      flags: { force: true },
    })

    expect(setCurrentSubcontext).toHaveBeenCalledWith(base, "002.feature-c")
  })

  it("shows dry-run output for subcontext doctype", () => {
    const base = workspace.copyFixture(multiSubcontextFixture, "sub-dryrun")
    const featuresDir = join(base, "features")

    mockProject({
      projectDir: base,
      currentSubcontext: false,
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
      },
      rawConfig: {
        extend: false,
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: [],
      },
    })

    // Remove 002 to create a gap
    const { rmSync } = require("node:fs")
    rmSync(join(featuresDir, "002.feature-b"), { recursive: true, force: true })

    seqfixCommand.callback!({
      _: { doctype: "features" },
      flags: { force: false },
    })

    expect(cli.info).toHaveBeenCalledWith("003.feature-c → 002.feature-c")
    expect(cli.info).toHaveBeenCalledWith(expect.stringContaining("-f"))
    expect(cli.success).not.toHaveBeenCalled()
  })
})
