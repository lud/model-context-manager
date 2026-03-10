import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as cli from "../lib/cli.js"
import { newCommand, resolveEditor } from "./new.js"
import { mockProject } from "../lib/project.test-helpers.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")
vi.mock("node:child_process")

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

describe("resolveEditor", () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  it("prefers MCM_EDITOR over EDITOR", () => {
    process.env = { ...originalEnv, MCM_EDITOR: "nvim", EDITOR: "vim" }
    expect(resolveEditor()).toBe("nvim")
  })

  it("falls back to EDITOR when MCM_EDITOR is not set", () => {
    process.env = { ...originalEnv, MCM_EDITOR: "", EDITOR: "vim" }
    expect(resolveEditor()).toBe("vim")
  })

  it("falls back to platform default when no editor env vars are set", () => {
    process.env = { ...originalEnv, MCM_EDITOR: "", EDITOR: "" }
    const editor = resolveEditor()
    expect(["xdg-open", "open", "start"]).toContain(editor)
  })
})

describe("newCommand", () => {
  it("creates a file with frontmatter and markdown heading", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
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
    expect(content).toContain("created_on:")
    expect(content).toContain("status: open")
    expect(content).toContain("# My First Note\n")
  })

  it("creates file with none scheme", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "none",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Simple", "Doc"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("simple-doc.md"),
    )

    const content = readFileSync(join(tempDir, "simple-doc.md"), "utf-8")
    expect(content).toContain("status: open")
    expect(content).toContain("# Simple Doc\n")
  })

  it("uses built-in default frontmatter when defaultProperties not configured", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Hello", "World"] } })

    const content = readFileSync(join(tempDir, "001.hello-world.md"), "utf-8")
    expect(content).toMatch(/created_on: \d{4}-\d{2}-\d{2}/)
    expect(content).toContain("status: open")
    expect(content).toContain("# Hello World\n")
  })

  it("uses custom defaultProperties when configured", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
          defaultProperties: { priority: "high" },
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Custom"] } })

    const content = readFileSync(join(tempDir, "001.custom.md"), "utf-8")
    expect(content).toContain("priority: high")
    expect(content).not.toContain("created_on")
    expect(content).not.toContain("status:")
  })

  it("warns and uses title fallback when defaultProperties is empty object", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
          defaultProperties: {},
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Empty", "Props"] } })

    expect(cli.warning).toHaveBeenCalledWith(
      expect.stringContaining('No frontmatter properties configured for doctype "notes"'),
    )
    const content = readFileSync(join(tempDir, "001.empty-props.md"), "utf-8")
    expect(content).toContain("title: Empty Props")
  })

  it("replaces {{date}} and {{title}} templates in defaultProperties", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
          defaultProperties: { created_on: "{{date}}", label: "{{title}}" },
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Template", "Test"] } })

    const content = readFileSync(join(tempDir, "001.template-test.md"), "utf-8")
    expect(content).toMatch(/created_on: \d{4}-\d{2}-\d{2}/)
    expect(content).toContain("label: Template Test")
  })

  it("aborts on file collision", () => {
    // Create first file
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "none",
          sequenceSeparator: ".",
          inSubcontext: false,
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
    mockProject({ doctypes: {} })

    expect(() =>
      newCommand.callback!({ _: { doctype: "unknown", title: ["Test"] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith("Unknown doctype: unknown")
  })

  it("creates directory if it does not exist", () => {
    const newDir = join(tempDir, "nested", "notes")
    mockProject({
      doctypes: {
        notes: {
          dir: newDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: false,
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Test"] } })

    expect(existsSync(newDir)).toBe(true)
    expect(existsSync(join(newDir, "001.test.md"))).toBe(true)
  })

  it("uses global max sequence across all subcontexts", () => {
    const base = mkdtempSync(join(tmpdir(), "mcm-new-sub-test-"))
    try {
      const sub1Notes = join(base, "features/001.sub-a/notes")
      const sub2Notes = join(base, "features/002.sub-b/notes")
      mkdirSync(sub1Notes, { recursive: true })
      mkdirSync(sub2Notes, { recursive: true })
      writeFileSync(join(sub1Notes, "001.first.md"), "")
      writeFileSync(join(sub1Notes, "002.second.md"), "")
      // sub2 is empty (active subcontext)

      mockProject({
        projectDir: base,
        currentSubcontext: "002.sub-b",
        doctypes: {
          notes: {
            dir: sub2Notes,
            sequenceScheme: "000",
            sequenceSeparator: ".",
            inSubcontext: true,
          },
        },
        rawConfig: {
          extend: false,
          doctypes: {
            notes: {
              dir: "notes",
              sequenceScheme: "000",
              sequenceSeparator: ".",
            },
          },
          sync: [],
          subcontexts: { dir: "features", doctypes: ["notes"] },
        },
      })

      newCommand.callback!({
        _: { doctype: "notes", title: ["Third", "Note"] },
      })

      expect(cli.writeln).toHaveBeenCalledWith(
        expect.stringContaining("003.third-note.md"),
      )
      expect(existsSync(join(sub2Notes, "003.third-note.md"))).toBe(true)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  describe("--open flag", () => {
    it("spawns editor with file path when --open is set", async () => {
      const { spawnSync } = await import("node:child_process")

      mockProject({
        doctypes: {
          notes: {
            dir: tempDir,
            sequenceScheme: "000",
            sequenceSeparator: ".",
            inSubcontext: false,
          },
        },
      })

      newCommand.callback!({
        _: { doctype: "notes", title: ["Open", "Me"] },
        flags: { open: true },
      })

      expect(spawnSync).toHaveBeenCalledWith(
        expect.any(String),
        [expect.stringContaining("001.open-me.md")],
        { stdio: "inherit" },
      )
    })

    it("does not spawn editor when --open is not set", async () => {
      const { spawnSync } = await import("node:child_process")

      mockProject({
        doctypes: {
          notes: {
            dir: tempDir,
            sequenceScheme: "000",
            sequenceSeparator: ".",
            inSubcontext: false,
          },
        },
      })

      newCommand.callback!({
        _: { doctype: "notes", title: ["No", "Open"] },
      })

      expect(spawnSync).not.toHaveBeenCalled()
    })
  })

  it("aborts when managed doctype used without subcontext", () => {
    mockProject({
      currentSubcontext: false,
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          inSubcontext: true,
        },
      },
    })

    expect(() =>
      newCommand.callback!({ _: { doctype: "notes", title: ["Test"] } }),
    ).toThrow("abortError")

    expect(cli.abortError).toHaveBeenCalledWith(
      'Doctype "notes" requires a subcontext. Use "mcm sub switch" to select one.',
    )
  })
})
