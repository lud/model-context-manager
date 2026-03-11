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
import type { ResolvedProject } from "../lib/project.js"

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
    anyTag: false,
    open: false,
    closed: false,
    props: [],
    first: false,
    ...overrides,
  }
}

describe("matchesFilters", () => {
  describe("--open", () => {
    const filters = makeFilters({ open: true })

    it("excludes status: closed", () => {
      expect(matchesFilters({ status: "closed" }, filters)).toBe(false)
    })

    it("includes status: open", () => {
      expect(matchesFilters({ status: "open" }, filters)).toBe(true)
    })

    it("includes missing status (open by default)", () => {
      expect(matchesFilters({}, filters)).toBe(true)
    })
  })

  describe("--closed", () => {
    const filters = makeFilters({ closed: true })

    it("includes status: closed", () => {
      expect(matchesFilters({ status: "closed" }, filters)).toBe(true)
    })

    it("excludes status: open", () => {
      expect(matchesFilters({ status: "open" }, filters)).toBe(false)
    })

    it("excludes missing status", () => {
      expect(matchesFilters({}, filters)).toBe(false)
    })
  })

  describe("--tag (AND logic)", () => {
    it("matches when all tags are present in array", () => {
      const filters = makeFilters({ tags: ["api", "auth"] })
      expect(matchesFilters({ tags: ["api", "auth", "extra"] }, filters)).toBe(true)
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

  describe("--tag with --any-tag (OR logic)", () => {
    it("matches when any tag is present", () => {
      const filters = makeFilters({ tags: ["api", "auth"], anyTag: true })
      expect(matchesFilters({ tags: ["auth"] }, filters)).toBe(true)
    })

    it("fails when no tags match", () => {
      const filters = makeFilters({ tags: ["api", "auth"], anyTag: true })
      expect(matchesFilters({ tags: ["other"] }, filters)).toBe(false)
    })
  })

  it("--prop delegates to propMatches", () => {
    const filters = makeFilters({ props: [{ key: "priority", value: "high" }] })
    expect(matchesFilters({ priority: "high" }, filters)).toBe(true)
    expect(matchesFilters({ priority: "low" }, filters)).toBe(false)
  })

  it("combined open + tag filters use intersection", () => {
    const filters = makeFilters({ open: true, tags: ["api"] })
    // closed with tag → excluded by open filter
    expect(matchesFilters({ status: "closed", tags: ["api"] }, filters)).toBe(false)
    // open without tag → excluded by tag filter
    expect(matchesFilters({ status: "open", tags: ["other"] }, filters)).toBe(false)
    // open with tag → included
    expect(matchesFilters({ status: "open", tags: ["api"] }, filters)).toBe(true)
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
        inSubcontext: false,
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
        inSubcontext: false,
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
      "001.open-tagged.md",
      "002.closed-tagged.md",
      "003.open-no-tags.md",
      "004.no-frontmatter.md",
    ])
  })

  it("--open: includes 001, 003, 004 (no frontmatter = open)", () => {
    listDoctypeFiles(makeNotesWithFmProject(), "notes", makeFilters({ open: true }))
    expect(capturedFileNames()).toEqual([
      "001.open-tagged.md",
      "003.open-no-tags.md",
      "004.no-frontmatter.md",
    ])
  })

  it("--closed: includes only 002", () => {
    listDoctypeFiles(makeNotesWithFmProject(), "notes", makeFilters({ closed: true }))
    expect(capturedFileNames()).toEqual(["002.closed-tagged.md"])
  })

  it("--tag api (AND): includes 001 and 002", () => {
    listDoctypeFiles(makeNotesWithFmProject(), "notes", makeFilters({ tags: ["api"] }))
    expect(capturedFileNames()).toEqual(["001.open-tagged.md", "002.closed-tagged.md"])
  })

  it("--tag api --tag auth (AND): includes only 001", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ tags: ["api", "auth"] }),
    )
    expect(capturedFileNames()).toEqual(["001.open-tagged.md"])
  })

  it("--tag api --any-tag (OR): includes 001 and 002", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ tags: ["api"], anyTag: true }),
    )
    expect(capturedFileNames()).toEqual(["001.open-tagged.md", "002.closed-tagged.md"])
  })

  it("--prop priority:high: includes only 003", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ props: [{ key: "priority", value: "high" }] }),
    )
    expect(capturedFileNames()).toEqual(["003.open-no-tags.md"])
  })

  it("--prop author: (empty value): includes 003 (null matches empty query)", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ props: [{ key: "author", value: "" }] }),
    )
    expect(capturedFileNames()).toEqual(["003.open-no-tags.md"])
  })

  it("--open --tag api: includes only 001", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ open: true, tags: ["api"] }),
    )
    expect(capturedFileNames()).toEqual(["001.open-tagged.md"])
  })

  it("--first: returns only the first file (001)", () => {
    listDoctypeFiles(makeNotesWithFmProject(), "notes", makeFilters({ first: true }))
    expect(capturedFileNames()).toEqual(["001.open-tagged.md"])
  })

  it("--first --closed: returns only the first closed file (002)", () => {
    listDoctypeFiles(
      makeNotesWithFmProject(),
      "notes",
      makeFilters({ first: true, closed: true }),
    )
    expect(capturedFileNames()).toEqual(["002.closed-tagged.md"])
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
          inSubcontext: false,
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
// Command-level error tests
// ---------------------------------------------------------------------------

describe("listCommand error cases", () => {
  it("--open --closed → abortError", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: notesWithFmDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })
    expect(() =>
      listCommand.callback!({
        _: { doctype: "notes" },
        flags: { open: true, closed: true },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "--open and --closed cannot be used together",
    )
  })

  it("filter flags without doctype arg → abortError", () => {
    mockProject({ doctypes: {} })
    expect(() =>
      listCommand.callback!({
        _: { doctype: undefined },
        flags: { open: true },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Filter flags require a doctype argument",
    )
  })

  it("--prop bad format (no colon) → abortError", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: notesWithFmDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })
    expect(() =>
      listCommand.callback!({
        _: { doctype: "notes" },
        flags: { prop: ["badformat"] },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Invalid --prop format (expected key:value): badformat",
    )
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
          inSubcontext: false,
        },
      },
    })

    listCommand.callback!({ _: { doctype: "notes" } })

    expect(cli.writeln).toHaveBeenCalled()
  })
})
