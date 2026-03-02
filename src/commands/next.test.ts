import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { nextCommand } from "./next.js"
import { mockProject } from "../lib/project.test-helpers.js"

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
          inSubcontext: false,
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
          inSubcontext: false,
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
          inSubcontext: false,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: undefined } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.title-of-doc.md"),
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
          inSubcontext: false,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["test"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.test.md"),
    )
  })

  it("works with custom separator", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "counter-custom-sep"),
          sequenceScheme: "000",
          sequenceSeparator: " - ",
          inSubcontext: false,
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["new", "note"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("003 - new-note.md"),
    )
  })
})
