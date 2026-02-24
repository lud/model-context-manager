import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { nextCommand } from "./next.js"
import { mockConfig } from "../lib/config.test-helpers.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/config.js")

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
    mockConfig({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "counter-three-digit"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["my", "note"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("004.my-note.md"),
    )
  })

  it("uses default slug when no title given", () => {
    mockConfig({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "empty"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: [] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.title-of-doc.md"),
    )
  })

  it("handles undefined title (no args)", () => {
    mockConfig({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "empty"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: undefined } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.title-of-doc.md"),
    )
  })

  it("aborts for unknown doctype", () => {
    mockConfig({ doctypes: {} })

    expect(() =>
      nextCommand.callback!({ _: { doctype: "unknown", title: [] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith("Unknown doctype: unknown")
  })

  it("treats missing directory as empty", () => {
    mockConfig({
      doctypes: {
        notes: {
          dir: "/nonexistent/path",
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["test"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.test.md"),
    )
  })

  it("works with custom separator", () => {
    mockConfig({
      doctypes: {
        notes: {
          dir: join(fixtureDir, "counter-custom-sep"),
          sequenceScheme: "000",
          sequenceSeparator: " - ",
        },
      },
    })

    nextCommand.callback!({ _: { doctype: "notes", title: ["new", "note"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("003 - new-note.md"),
    )
  })
})
