import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as cli from "../lib/cli.js"
import * as resolveFileModule from "../lib/resolve-file.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { doneCommand } from "./done.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")
vi.mock("../lib/resolve-file.js")

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "mcm-done-test-"))
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
  mockProject({ projectDir: tempDir })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
  vi.resetAllMocks()
})

describe("doneCommand", () => {
  it("sets status: done and preserves other fields", () => {
    const filePath = join(tempDir, "test.md")
    writeFileSync(
      filePath,
      "---\ntitle: My Note\nstatus: active\n---\n# My Note\n",
    )
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    doneCommand.callback!({
      _: { pathOrDoctype: filePath, id: undefined },
      flags: {},
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("status: done")
    expect(content).toContain("title: My Note")
    expect(content).toContain("# My Note")
  })

  it("prepends frontmatter when file has none", () => {
    const filePath = join(tempDir, "plain.md")
    writeFileSync(filePath, "# Plain File\n")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    doneCommand.callback!({
      _: { pathOrDoctype: filePath, id: undefined },
      flags: {},
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toMatch(/^---\n/)
    expect(content).toContain("status: done")
    expect(content).toContain("# Plain File")
  })

  it("adds status: done when no prior status key", () => {
    const filePath = join(tempDir, "no-status.md")
    writeFileSync(filePath, "---\ntitle: Hello\n---\nBody\n")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    doneCommand.callback!({
      _: { pathOrDoctype: filePath, id: undefined },
      flags: {},
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("status: done")
    expect(content).toContain("title: Hello")
  })

  it("calls cli.writeln with the display path", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    doneCommand.callback!({
      _: { pathOrDoctype: filePath, id: undefined },
      flags: {},
    })

    expect(cli.writeln).toHaveBeenCalledWith(expect.stringContaining("note.md"))
  })

  it("passes two args when id is provided", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    doneCommand.callback!({ _: { pathOrDoctype: "notes", id: "1" }, flags: {} })

    expect(resolveFileModule.resolveFileArg).toHaveBeenCalledWith(
      expect.anything(),
      ["notes", "1"],
      process.cwd(),
    )
  })

  it("passes single arg when no id", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n")
    vi.mocked(resolveFileModule.resolveFileArg).mockReturnValue(filePath)

    doneCommand.callback!({
      _: { pathOrDoctype: filePath, id: undefined },
      flags: {},
    })

    expect(resolveFileModule.resolveFileArg).toHaveBeenCalledWith(
      expect.anything(),
      [filePath],
      process.cwd(),
    )
  })
})
