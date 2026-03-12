import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { nextCommand } from "./next.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { DoctypeRole } from "../lib/project.js"

const multiSubcontextFixture = join(
  import.meta.dirname,
  "../../test/fixtures/doctypes/multi-subcontext",
)

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")

const fixtureDir = join(import.meta.dirname, "../../test/fixtures/sequence")

beforeEach(() => {
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

describe("nextCommand", () => {
  it("outputs next filename with counter scheme", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "counter-three-digit"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["my", "note"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("004.my-note.md"),
    )
  })

  it("uses default slug when no title given", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "empty"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: [] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.title-of-doc.md"),
    )
  })

  it("handles undefined title (no args)", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "empty"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: undefined } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.title-of-doc.md"),
    )
  })

  it("aborts for managed doctype without active subcontext", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: "/mock/notes",
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
      },
      currentSubcontext: false,
    })

    expect(() =>
      nextCommand.callback!({ _: { doctype: "notes", title: ["test"] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("requires a subcontext"),
    )
  })

  it("aborts for unknown doctype", () => {
    mockProject({ doctypes: {} })

    expect(() =>
      nextCommand.callback!({ _: { doctype: "unknown", title: [] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith("Unknown doctype: unknown")
  })

  it("treats missing directory as empty", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: "/nonexistent/path",
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["test"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.test.md"),
    )
  })

  it("uses global max sequence across all subcontexts", () => {
    // fixture has: 001.feature-a/notes: 001.intro.md, 003.design.md
    //              002.feature-b/notes: 001.login.md, 002.auth.md
    // global max = 3, so next = 004
    mockProject({
      projectDir: multiSubcontextFixture,
      currentSubcontext: "002.feature-b",
      doctypes: {
        features: {
          dir: join(multiSubcontextFixture, "features"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          dir: join(multiSubcontextFixture, "features/002.feature-b/notes"),
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

    nextCommand.callback!({ _: { doctype: "notes", title: ["new", "note"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("004.new-note.md"),
    )
  })

  it("works with custom separator", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "counter-custom-sep"),
          sequenceScheme: "000",
          sequenceSeparator: " - ",
          role: DoctypeRole.Regular,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["new", "note"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("003 - new-note.md"),
    )
  })
})
