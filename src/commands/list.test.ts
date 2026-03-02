import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { listAllDoctypes, listCommand, listDoctypeFiles } from "./list.js"
import { mockProject } from "../lib/project.test-helpers.js"
import type { ResolvedProject } from "../lib/project.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")

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

describe("listDoctypeFiles", () => {
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

  it("aborts when managed doctype used without subcontext", () => {
    const project = {
      currentSubcontext: false,
      doctypes: {
        notes: {
          dir: join(listFilesFixture, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: true,
        },
      },
    } as unknown as ResolvedProject
    expect(() => listDoctypeFiles(project, "notes")).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      'Doctype "notes" requires a subcontext. Use "mcm sub switch" to select one.',
    )
  })
})

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
