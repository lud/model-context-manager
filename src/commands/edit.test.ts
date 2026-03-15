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
import { editCommand } from "./edit.js"

vi.mock("../lib/cli.js")

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "mcm-edit-test-"))
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
  vi.resetAllMocks()
})

describe("editCommand", () => {
  it("sets a property via --set", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n# Note\n")

    editCommand.callback!({
      _: { file: filePath },
      flags: { set: ["status:specified"] },
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("status: specified")
    expect(content).toContain("# Note")
  })

  it("splits --set on the first colon only", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n# Note\n")

    editCommand.callback!({
      _: { file: filePath },
      flags: { set: ["summary:http://example.test/a:b"] },
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("summary: http://example.test/a:b")
  })

  it("applies repeated --set in order so last one wins", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n# Note\n")

    editCommand.callback!({
      _: { file: filePath },
      flags: { set: ["status:foo", "status:baz"] },
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("status: baz")
    expect(content).not.toContain("status: foo")
  })

  it("applies --set-status after --set so --set-status wins", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n# Note\n")

    editCommand.callback!({
      _: { file: filePath },
      flags: {
        set: ["status:foo", "owner:alice", "status:baz"],
        setStatus: "bar",
      },
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("status: bar")
    expect(content).toContain("owner: alice")
  })

  it("adds frontmatter when file has none", () => {
    const filePath = join(tempDir, "plain.md")
    writeFileSync(filePath, "# Plain\n")

    editCommand.callback!({
      _: { file: filePath },
      flags: { setStatus: "done" },
    })

    const content = readFileSync(filePath, "utf-8")
    expect(content).toMatch(/^---\n/)
    expect(content).toContain("status: done")
    expect(content).toContain("# Plain")
  })

  it("prints the edited file path", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n")

    editCommand.callback!({
      _: { file: filePath },
      flags: { setStatus: "done" },
    })

    expect(cli.writeln).toHaveBeenCalledWith(expect.stringContaining("note.md"))
  })

  it("aborts when no updates are provided", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n")

    expect(() =>
      editCommand.callback!({ _: { file: filePath }, flags: {} }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "No updates provided. Use --set key:value or --set-status value",
    )
  })

  it("aborts on invalid --set format", () => {
    const filePath = join(tempDir, "note.md")
    writeFileSync(filePath, "---\nstatus: active\n---\n")

    expect(() =>
      editCommand.callback!({
        _: { file: filePath },
        flags: { set: ["invalid"] },
      }),
    ).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Invalid --set format (expected key:value): invalid",
    )
  })

  it("aborts when file does not exist", () => {
    const filePath = join(tempDir, "missing", "note.md")
    mkdirSync(join(tempDir, "missing"), { recursive: true })

    expect(() =>
      editCommand.callback!({
        _: { file: filePath },
        flags: { setStatus: "done" },
      }),
    ).toThrow("abortError")
  })
})
