import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import {
  listAllDoctypes,
  listCommand,
  listDoctypeFiles,
  matchesFilters,
  propMatches,
} from "./list.js"
import type { ListFilters } from "./list.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { DoctypeRole, type ResolvedProject } from "../lib/project.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")

const listFilesFixture = join(
  import.meta.dirname,
  "../../test/fixtures/list-files",
)

const notesWithFmDir = join(listFilesFixture, "notes-with-fm")

beforeEach(() => {
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// propMatches — pure unit tests
// ---------------------------------------------------------------------------

describe("propMatches", () => {
  it("matches empty string value when property is empty string", () => {
    expect(propMatches({ key: "" }, "key", "")).toBe(true)
  })

  it("matches empty string value when property is null", () => {
    expect(propMatches({ key: null }, "key", "")).toBe(true)
  })

  it("does not match empty string query when property is undefined (key absent)", () => {
    expect(propMatches({}, "key", "")).toBe(false)
  })

  it("matches numeric yaml value via String() coercion", () => {
    expect(propMatches({ count: 5 }, "count", "5")).toBe(true)
  })

  it("returns false on value mismatch", () => {
    expect(propMatches({ status: "open" }, "status", "closed")).toBe(false)
  })

  it("returns false when key is absent", () => {
    expect(propMatches({}, "missing", "value")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesFilters — pure unit tests
// ---------------------------------------------------------------------------

function makeFilters(overrides: Partial<ListFilters> = {}): ListFilters {
  return {
    tags: [],
    active: false,
    done: false,
    status: undefined,
    is: [],
    first: false,
    ...overrides,
  }
}

describe("matchesFilters", () => {
  describe("--active", () => {
    const filters = makeFilters({ active: true })

    it("excludes status: done", () => {
      expect(matchesFilters({ status: "done" }, filters)).toBe(false)
    })

    it("includes status: active", () => {
      expect(matchesFilters({ status: "active" }, filters)).toBe(true)
    })

    it("includes missing status (active by default)", () => {
      expect(matchesFilters({}, filters)).toBe(true)
    })
  })

  describe("--done", () => {
    const filters = makeFilters({ done: true })

    it("includes status: done", () => {
      expect(matchesFilters({ status: "done" }, filters)).toBe(true)
    })

    it("excludes status: active", () => {
      expect(matchesFilters({ status: "active" }, filters)).toBe(false)
    })

    it("excludes missing status", () => {
      expect(matchesFilters({}, filters)).toBe(false)
    })
  })

  describe("--tag (AND logic)", () => {
    it("matches when all tags are present in array", () => {
      const filters = makeFilters({ tags: ["api", "auth"] })
      expect(matchesFilters({ tags: ["api", "auth", "extra"] }, filters)).toBe(
        true,
      )
    })

    it("fails when one tag is missing", () => {
      const filters = makeFilters({ tags: ["api", "auth"] })
      expect(matchesFilters({ tags: ["api"] }, filters)).toBe(false)
    })

    it("does not match scalar tags field", () => {
      const filters = makeFilters({ tags: ["api"] })
      expect(matchesFilters({ tags: "api" }, filters)).toBe(false)
    })
  })

  it("--is delegates to propMatches", () => {
    const filters = makeFilters({ is: [{ key: "priority", value: "high" }] })
    expect(matchesFilters({ priority: "high" }, filters)).toBe(true)
    expect(matchesFilters({ priority: "low" }, filters)).toBe(false)
  })

  it("--status matches exact status", () => {
    const filters = makeFilters({ status: "specified" })
    expect(matchesFilters({ status: "specified" }, filters)).toBe(true)
    expect(matchesFilters({ status: "done" }, filters)).toBe(false)
  })

  it("--status and --is status:other are both applied (AND)", () => {
    const filters = makeFilters({
      status: "specified",
      is: [{ key: "status", value: "done" }],
    })
    expect(matchesFilters({ status: "specified" }, filters)).toBe(false)
    expect(matchesFilters({ status: "done" }, filters)).toBe(false)
  })

  it("combined active + tag filters use intersection", () => {
    const filters = makeFilters({ active: true, tags: ["api"] })
    // done with tag → excluded by active filter
    expect(matchesFilters({ status: "done", tags: ["api"] }, filters)).toBe(
      false,
    )
    // active without tag → excluded by tag filter
    expect(matchesFilters({ status: "active", tags: ["other"] }, filters)).toBe(
      false,
    )
    // active with tag → included
    expect(matchesFilters({ status: "active", tags: ["api"] }, filters)).toBe(
      true,
    )
  })
})

// ---------------------------------------------------------------------------
// listAllDoctypes
// ---------------------------------------------------------------------------

describe("listAllDoctypes", () => {
  it("calls cli.warning when no doctypes configured", () => {
    listAllDoctypes({})
    expect(cli.warning).toHaveBeenCalledWith("No doctypes configured.")
    expect(cli.writeln).not.toHaveBeenCalled()
  })

  it("prints each doctype with its display path", () => {
    const doctypes = {
      notes: {
        dir: "/absolute/docs",
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Regular,
      },
    }
    listAllDoctypes(doctypes)
    expect(cli.writeln).toHaveBeenCalledWith("notes: /absolute/docs")
  })
})

// ---------------------------------------------------------------------------
// listDoctypeFiles — integration tests using notes-with-fm fixture
// ---------------------------------------------------------------------------

function makeNotesWithFmProject(): ResolvedProject {
  return {
    currentSubcontext: false,
    doctypes: {
      notes: {
        dir: notesWithFmDir,
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Regular,
      },
    },
  } as unknown as ResolvedProject
}

function capturedFileNames(): string[] {
  return vi.mocked(cli.writeln).mock.calls.map((c) => c[0].split("/").pop()!)
}

describe("listDoctypeFiles — notes-with-fm fixture", () => {
  it("no filters: lists all 4 files in sorted order", () => {
    listDoctypeFiles(makeNotesWithFmProject(), "notes")
    expect(capturedFileNames()).toEqual([
      "001.active-tagged.md",
      "002.done-tagged.md",
      "003.active-no-tags.md",
      "004.no-frontmatter.md",
    ])
  })

  it("--active: includes 001, 003, 004 (no frontmatter = active)", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ active: true }),
    )
    expect(capturedFileNames()).toEqual([
      "001.active-tagged.md",
      "003.active-no-tags.md",
      "004.no-frontmatter.md",
    ])
  })

  it("--done: includes only 002", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ done: true }),
    )
    expect(capturedFileNames()).toEqual(["002.done-tagged.md"])
  })

  it("--tag api (AND): includes 001 and 002", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ tags: ["api"] }),
    )
    expect(capturedFileNames()).toEqual([
      "001.active-tagged.md",
      "002.done-tagged.md",
    ])
  })

  it("--tag api --tag auth (AND): includes only 001", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ tags: ["api", "auth"] }),
    )
    expect(capturedFileNames()).toEqual(["001.active-tagged.md"])
  })

  it("--tag api (single tag): includes 001 and 002", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ tags: ["api"] }),
    )
    expect(capturedFileNames()).toEqual([
      "001.active-tagged.md",
      "002.done-tagged.md",
    ])
  })

  it("--is priority:high: includes only 003", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ is: [{ key: "priority", value: "high" }] }),
    )
    expect(capturedFileNames()).toEqual(["003.active-no-tags.md"])
  })

  it("--is author: (empty value): includes 003 (null matches empty query)", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ is: [{ key: "author", value: "" }] }),
    )
    expect(capturedFileNames()).toEqual(["003.active-no-tags.md"])
  })

  it("--status done: includes only 002", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ status: "done" }),
    )
    expect(capturedFileNames()).toEqual(["002.done-tagged.md"])
  })

  it("--active --tag api: includes only 001", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ active: true, tags: ["api"] }),
    )
    expect(capturedFileNames()).toEqual(["001.active-tagged.md"])
  })

  it("--first: returns only the first file (001)", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ first: true }),
    )
    expect(capturedFileNames()).toEqual(["001.active-tagged.md"])
  })

  it("--first --done: returns only the first done file (002)", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ first: true, done: true }),
    )
    expect(capturedFileNames()).toEqual(["002.done-tagged.md"])
  })
})

describe("listDoctypeFiles — existing fixture", () => {
  it("lists files in sorted order", () => {
    const project = {
      currentSubcontext: false,
      doctypes: {
        notes: {
          dir: join(listFilesFixture, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    } as unknown as ResolvedProject
    listDoctypeFiles(project, "notes")

    const calls = vi.mocked(cli.writeln).mock.calls.map((c) => c[0])
    const names = calls.map((p) => p.split("/").pop())
    expect(names).toEqual(["apple.md", "mango.md", "zebra.md"])
  })

  it("calls cli.abortError for unknown doctype", () => {
    const project = {
      currentSubcontext: false,
      doctypes: {},
    } as unknown as ResolvedProject
    expect(() => listDoctypeFiles(project, "unknown")).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith("Unknown doctype: unknown")
  })
})

// ---------------------------------------------------------------------------
// listDoctypeFiles — subcontext doctype (briefs)
// ---------------------------------------------------------------------------

const multiSubcontextFixture = join(
  import.meta.dirname,
  "../../test/fixtures/doctypes/multi-subcontext",
)

describe("listDoctypeFiles — subcontext doctype", () => {
  function mockSubcontextProject() {
    mockProject({
      currentSubcontext: false,
      projectDir: multiSubcontextFixture,
      projectFile: join(multiSubcontextFixture, ".mcm.json"),
      subcontextDoctype: "features",
      managedDoctypes: ["notes"],
      doctypes: {
        features: {
          dir: join(multiSubcontextFixture, "features"),
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
        managedDoctypes: ["notes"],
      },
    })
  }

  it("lists brief files from subcontext directories", () => {
    mockSubcontextProject()

    listCommand.callback!({ _: { doctype: "features" } })

    const calls = vi.mocked(cli.writeln).mock.calls.map((c) => c[0])
    const names = calls.map((p) => String(p).split("/").pop())
    expect(names).toContain("001.feature-a.md")
    expect(names).toContain("002.feature-b.md")
  })

  it("filters briefs by frontmatter status", () => {
    mockSubcontextProject()

    listCommand.callback!({
      _: { doctype: "features" },
      flags: { active: true },
    })

    const calls = vi.mocked(cli.writeln).mock.calls.map((c) => c[0])
    const names = calls.map((p) => String(p).split("/").pop())
    expect(names).toContain("001.feature-a.md")
    expect(names).toContain("002.feature-b.md")
  })
})

// ---------------------------------------------------------------------------
// Command-level error tests
// ---------------------------------------------------------------------------

describe("listCommand error cases", () => {
  it("--active --done → abortError", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: notesWithFmDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })
    expect(() =>
      listCommand.callback!({
        _: { doctype: "notes" },
        flags: { active: true, done: true },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "--active and --done cannot be used together",
    )
  })

  it("filter flags without doctype arg → abortError", () => {
    mockProject({ doctypes: {} })
    expect(() =>
      listCommand.callback!({
        _: { doctype: undefined },
        flags: { active: true },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Filter flags require a doctype argument",
    )
  })

  it("--is bad format (no colon) → abortError", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: notesWithFmDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })
    expect(() =>
      listCommand.callback!({
        _: { doctype: "notes" },
        flags: { is: ["badformat"] },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Invalid --is format (expected key:value): badformat",
    )
  })

  it("--is splits on the first colon only", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: notesWithFmDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    listCommand.callback!({
      _: { doctype: "notes" },
      flags: { is: ["url:http://example.test/a:b"] },
    })

    expect(cli.writeln).not.toHaveBeenCalled()
  })

  it("--all-subcontexts without doctype arg → abortError", () => {
    mockProject({ doctypes: {} })
    expect(() =>
      listCommand.callback!({
        _: { doctype: undefined },
        flags: { allSubcontexts: true },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Filter flags require a doctype argument",
    )
  })
})

// ---------------------------------------------------------------------------
// listCommand integration
// ---------------------------------------------------------------------------

describe("listCommand integration", () => {
  it("routes to listAllDoctypes when no doctype arg given", () => {
    mockProject({ doctypes: {} })

    listCommand.callback!({ _: { doctype: undefined } })

    expect(cli.warning).toHaveBeenCalledWith("No doctypes configured.")
  })

  it("routes to listDoctypeFiles when doctype arg given", () => {
    const notesDir = join(listFilesFixture, "notes")
    mockProject({
      doctypes: {
        notes: {
          dir: notesDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    listCommand.callback!({ _: { doctype: "notes" } })

    expect(cli.writeln).toHaveBeenCalled()
  })
})
