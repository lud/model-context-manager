import { describe, expect, it, vi } from "vitest"
import { resolve, join } from "node:path"
import * as cli from "../lib/cli.js"
import * as projectModule from "../lib/project.js"
import * as resolveFileModule from "../lib/resolve-file.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { DoctypeRole } from "../lib/project.js"
import { readCommand } from "./read.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")
vi.mock("../lib/resolve-file.js")

vi.mocked(cli.abortError).mockImplementation((msg: string) => {
  throw new Error(msg)
})

const fixtureBase = resolve("test/fixtures")
const noSubcontextDir = join(fixtureBase, "status/no-subcontext")
const notesDir = join(noSubcontextDir, "notes")

describe("readCommand", () => {
  it("outputs full file content with single path argument", () => {
    mockProject({
      projectDir: noSubcontextDir,
      projectFile: join(noSubcontextDir, ".mcm.json"),
      doctypes: {
        notes: {
          dir: notesDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    const filePath = join(notesDir, "001.meeting.md")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    readCommand.callback!({ _: { file: filePath, id: undefined }, flags: {} })

    expect(resolveFileModule.resolveFileArg).toHaveBeenCalledWith(
      expect.anything(),
      [filePath],
      process.cwd(),
    )
    expect(cli.write).toHaveBeenCalledWith(
      expect.stringContaining("---"),
    )
  })

  it("passes two args when id is provided", () => {
    mockProject({
      projectDir: noSubcontextDir,
      projectFile: join(noSubcontextDir, ".mcm.json"),
      doctypes: {
        notes: {
          dir: notesDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    const filePath = join(notesDir, "001.meeting.md")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    readCommand.callback!({ _: { file: "notes", id: "1" }, flags: {} })

    expect(resolveFileModule.resolveFileArg).toHaveBeenCalledWith(
      expect.anything(),
      ["notes", "1"],
      process.cwd(),
    )
  })

  it("passes --sub flag to getProject", () => {
    mockProject({
      projectDir: noSubcontextDir,
      projectFile: join(noSubcontextDir, ".mcm.json"),
      doctypes: {
        notes: {
          dir: notesDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    const filePath = join(notesDir, "001.meeting.md")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    readCommand.callback!({
      _: { file: "notes", id: "1" },
      flags: { sub: "my-sub" },
    })

    expect(projectModule.getProject).toHaveBeenCalledWith({ sub: "my-sub" })
  })
})
