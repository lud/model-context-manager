import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { listAllDoctypes, listCommand, listDoctypeFiles } from "./list.js"
import { mockConfig } from "../lib/config.test-helpers.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/config.js")

const listFilesFixture = join(
  import.meta.dirname,
  "../../test/fixtures/list-files",
)

beforeEach(() => {
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

describe("listAllDoctypes", () => {
  it("calls cli.warning when no doctypes configured", () => {
    listAllDoctypes({})
    expect(cli.warning).toHaveBeenCalledWith("No doctypes configured.")
    expect(cli.writeln).not.toHaveBeenCalled()
  })

  it("prints each doctype with its display path", () => {
    const doctypes = { notes: { dir: "/absolute/docs" } }
    listAllDoctypes(doctypes)
    expect(cli.writeln).toHaveBeenCalledWith("notes: /absolute/docs")
  })
})

describe("listDoctypeFiles", () => {
  it("lists files in sorted order", () => {
    const doctypes = { notes: { dir: join(listFilesFixture, "notes") } }
    listDoctypeFiles(doctypes, "notes")

    const calls = vi.mocked(cli.writeln).mock.calls.map((c) => c[0])
    const names = calls.map((p) => p.split("/").pop())
    expect(names).toEqual(["apple.md", "mango.md", "zebra.md"])
  })

  it("calls cli.abortError for unknown doctype", () => {
    expect(() => listDoctypeFiles({}, "unknown")).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith("Unknown doctype: unknown")
  })
})

describe("listCommand integration", () => {
  it("routes to listAllDoctypes when no doctype arg given", () => {
    mockConfig({ doctypes: {} })

    listCommand.callback!({ _: { doctype: undefined } })

    expect(cli.warning).toHaveBeenCalledWith("No doctypes configured.")
  })

  it("routes to listDoctypeFiles when doctype arg given", () => {
    const notesDir = join(listFilesFixture, "notes")
    mockConfig({ doctypes: { notes: { dir: notesDir } } })

    listCommand.callback!({ _: { doctype: "notes" } })

    expect(cli.writeln).toHaveBeenCalled()
  })
})
