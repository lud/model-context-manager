import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as cli from "../lib/cli.js"
import { newCommand } from "./new.js"
import { mockConfig } from "../lib/config.test-helpers.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/config.js")

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "mcm-new-test-"))
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
  vi.resetAllMocks()
})

describe("newCommand", () => {
  it("creates a file with markdown heading", () => {
    mockConfig({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
    })

    newCommand.callback!({
      _: { doctype: "notes", title: ["My", "First", "Note"] },
    })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.my-first-note.md"),
    )

    const content = readFileSync(join(tempDir, "001.my-first-note.md"), "utf-8")
    expect(content).toBe("# My First Note\n")
  })

  it("creates file with none scheme", () => {
    mockConfig({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "none",
          sequenceSeparator: ".",
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Simple", "Doc"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("simple-doc.md"),
    )

    const content = readFileSync(join(tempDir, "simple-doc.md"), "utf-8")
    expect(content).toBe("# Simple Doc\n")
  })

  it("aborts on file collision", () => {
    // Create first file
    mockConfig({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "none",
          sequenceSeparator: ".",
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Dup"] } })

    // Try to create same file again
    expect(() =>
      newCommand.callback!({ _: { doctype: "notes", title: ["Dup"] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("File already exists"),
    )
  })

  it("aborts for unknown doctype", () => {
    mockConfig({ doctypes: {} })

    expect(() =>
      newCommand.callback!({ _: { doctype: "unknown", title: ["Test"] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith("Unknown doctype: unknown")
  })

  it("aborts when directory does not exist", () => {
    mockConfig({
      doctypes: {
        notes: {
          dir: "/nonexistent/path",
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
    })

    expect(() =>
      newCommand.callback!({ _: { doctype: "notes", title: ["Test"] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith(
      "Directory does not exist: /nonexistent/path",
    )
  })
})
