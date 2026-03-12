import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
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
import { DoctypeRole } from "../lib/project.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")
vi.mock("node:child_process")

let tempDir: string

// Mock global config storage in memory
let storedSubcontexts: Record<string, string> = {}

vi.mock("../lib/global-config.js", () => ({
  getCurrentSubcontext: (dir: string) => storedSubcontexts[dir],
  setCurrentSubcontext: (dir: string, name: string) => {
    storedSubcontexts[dir] = name
  },
}))

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "mcm-new-test-"))
  storedSubcontexts = {}
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
          role: DoctypeRole.Regular,
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
    expect(content).toContain("status: active")
    expect(content).toContain("# My First Note\n")
  })

  it("creates file with none scheme", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "none",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Simple", "Doc"] } })

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("simple-doc.md"),
    )

    const content = readFileSync(join(tempDir, "simple-doc.md"), "utf-8")
    expect(content).toContain("status: active")
    expect(content).toContain("# Simple Doc\n")
  })

  it("uses built-in default frontmatter when defaultProperties not configured", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Hello", "World"] } })

    const content = readFileSync(join(tempDir, "001.hello-world.md"), "utf-8")
    expect(content).toMatch(/created_on: \d{4}-\d{2}-\d{2}/)
    expect(content).toContain("status: active")
    expect(content).toContain("# Hello World\n")
  })

  it("uses custom defaultProperties when configured", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
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
          role: DoctypeRole.Regular,
          defaultProperties: {},
        },
      },
    })

    newCommand.callback!({ _: { doctype: "notes", title: ["Empty", "Props"] } })

    expect(cli.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'No frontmatter properties configured for doctype "notes"',
      ),
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
          role: DoctypeRole.Regular,
          defaultProperties: { created_on: "{{date}}", label: "{{title}}" },
        },
      },
    })

    newCommand.callback!({
      _: { doctype: "notes", title: ["Template", "Test"] },
    })

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
          role: DoctypeRole.Regular,
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
          role: DoctypeRole.Regular,
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
          features: {
            dir: join(base, "features"),
            sequenceScheme: "000",
            sequenceSeparator: ".",
            role: DoctypeRole.Subcontext,
          },
          notes: {
            dir: sub2Notes,
            sequenceScheme: "000",
            sequenceSeparator: ".",
            role: DoctypeRole.Managed,
          },
        },
        rawConfig: {
          extend: false,
          doctypes: {
            features: {
              dir: "features",
              sequenceScheme: "000",
              sequenceSeparator: ".",
            },
            notes: {
              dir: "notes",
              sequenceScheme: "000",
              sequenceSeparator: ".",
            },
          },
          sync: [],
          subcontextDoctype: "features",
          managedDoctypes: ["notes"],
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
            role: DoctypeRole.Regular,
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
            role: DoctypeRole.Regular,
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
          role: DoctypeRole.Managed,
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

describe("newCommand — subcontext doctype", () => {
  it("creates subcontext dir + brief + managed subdirs without switching", () => {
    const featuresDir = join(tempDir, "features")
    mkdirSync(featuresDir, { recursive: true })

    mockProject({
      projectDir: tempDir,
      rawConfig: {
        extend: false,
        sync: [],
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          tasks: {
            dir: "tasks",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        subcontextDoctype: "features",
        managedDoctypes: ["tasks"],
      },
      subcontextDoctype: "features",
      managedDoctypes: ["tasks"],
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        tasks: {
          dir: join(tempDir, "tasks"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
      },
    })

    newCommand.callback!({
      _: { doctype: "features", title: ["add", "auth"] },
    })

    // Directory created
    expect(existsSync(join(featuresDir, "001.add-auth"))).toBe(true)
    // Managed subdir created
    expect(existsSync(join(featuresDir, "001.add-auth", "tasks"))).toBe(true)
    // Brief file created
    const briefPath = join(featuresDir, "001.add-auth", "001.add-auth.md")
    expect(existsSync(briefPath)).toBe(true)
    // Brief has frontmatter
    const content = readFileSync(briefPath, "utf-8")
    expect(content).toContain("status: active")
    expect(content).toContain("# add auth\n")
    // Does NOT auto-switch
    expect(storedSubcontexts[tempDir]).toBeUndefined()
    // Output includes brief path
    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.add-auth.md"),
    )
  })

  it("increments number from existing subcontexts", () => {
    const featuresDir = join(tempDir, "features")
    mkdirSync(join(featuresDir, "001.first"), { recursive: true })

    mockProject({
      projectDir: tempDir,
      rawConfig: {
        extend: false,
        sync: [],
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        subcontextDoctype: "features",
        managedDoctypes: [],
      },
      subcontextDoctype: "features",
      managedDoctypes: [],
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
      },
    })

    newCommand.callback!({
      _: { doctype: "features", title: ["second"] },
    })

    expect(existsSync(join(featuresDir, "002.second"))).toBe(true)
    expect(existsSync(join(featuresDir, "002.second", "002.second.md"))).toBe(
      true,
    )
  })

  it("switches to new subcontext when --switch is passed", () => {
    const featuresDir = join(tempDir, "features")
    mkdirSync(featuresDir, { recursive: true })

    mockProject({
      projectDir: tempDir,
      rawConfig: {
        extend: false,
        sync: [],
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        subcontextDoctype: "features",
        managedDoctypes: [],
      },
      subcontextDoctype: "features",
      managedDoctypes: [],
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
      },
    })

    newCommand.callback!({
      _: { doctype: "features", title: ["my", "feature"] },
      flags: { switch: true },
    })

    expect(storedSubcontexts[tempDir]).toBe("001.my-feature")
  })

  it("warns when --switch is used with non-subcontext doctype", () => {
    mockProject({
      doctypes: {
        notes: {
          dir: tempDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    newCommand.callback!({
      _: { doctype: "notes", title: ["Test"] },
      flags: { switch: true },
    })

    expect(cli.warning).toHaveBeenCalledWith(
      "Cannot switch: not a subcontext doctype.",
    )
  })

  it("resolves 'sub' alias to subcontext doctype", () => {
    const featuresDir = join(tempDir, "features")
    mkdirSync(featuresDir, { recursive: true })

    mockProject({
      projectDir: tempDir,
      rawConfig: {
        extend: false,
        sync: [],
        doctypes: {
          features: {
            dir: "features",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        subcontextDoctype: "features",
        managedDoctypes: [],
      },
      subcontextDoctype: "features",
      managedDoctypes: [],
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
      },
    })

    newCommand.callback!({
      _: { doctype: "sub", title: ["test"] },
    })

    expect(existsSync(join(featuresDir, "001.test"))).toBe(true)
  })
})
