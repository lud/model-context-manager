import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as cli from "../lib/cli.js"
import { doneCommand } from "./done.js"

vi.mock("../lib/cli.js")

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "mcm-done-test-"))
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
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

    doneCommand.callback!({ _: { file: filePath } })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("status: done")
    expect(content).toContain("title: My Note")
    expect(content).toContain("# My Note")
  })

  it("prepends frontmatter when file has none", () => {
    const filePath = join(tempDir, "plain.md")
    writeFileSync(filePath, "# Plain File\n")

    doneCommand.callback!({ _: { file: filePath } })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toMatch(/^---\n/)
    expect(content).toContain("status: done")
    expect(content).toContain("# Plain File")
  })

  it("adds status: done when no prior status key", () => {
    const filePath = join(tempDir, "no-status.md")
    writeFileSync(filePath, "---\ntitle: Hello\n---\nBody\n")

    doneCommand.callback!({ _: { file: filePath } })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("status: done")
    expect(content).toContain("title: Hello")
  })

  it("calls cli.writeln with the display path", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n")

    doneCommand.callback!({ _: { file: filePath } })

    expect(cli.writeln).toHaveBeenCalledWith(expect.stringContaining("note.md"))
  })

  it("aborts when file does not exist", () => {
    const filePath = join(tempDir, "nonexistent.md")

    expect(() => doneCommand.callback!({ _: { file: filePath } })).toThrow(
      "abortError",
    )
  })
})
