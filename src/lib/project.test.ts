import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"
import {
  loadProjectOrFail,
  getProject,
  locateProjectFile,
  parseProject,
} from "./project.js"
import { join, resolve } from "node:path"
import { cpSync, mkdtempSync, mkdirSync, chmodSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import * as cli from "./cli.js"

vi.mock("./cli.js")

// Copy project-lookup fixtures to /tmp so locateProjectFile walk-up
// doesn't find the project's own .mcm.json
const workspace = mkdtempSync(join(tmpdir(), "mcm-test-project-"))
const srcFixtures = join(
  import.meta.dirname,
  "../../test/fixtures",
  "project-lookup",
)
cpSync(srcFixtures, join(workspace, "project-lookup"), { recursive: true })
const fixtures = join(workspace, "project-lookup")

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

describe("parseProject", () => {
  it("returns default project for empty object", () => {
    expect(parseProject({})).toEqual({ extend: false, doctypes: {} })
  })

  it("respects extend: true when provided", () => {
    expect(parseProject({ extend: true })).toEqual({
      extend: true,
      doctypes: {},
    })
  })

  it("throws ZodError when extend is wrong type", () => {
    expect(() => parseProject({ extend: "yes" })).toThrow(ZodError)
  })

  it("throws ZodError when passed null", () => {
    expect(() => parseProject(null)).toThrow(ZodError)
  })

  it("throws ZodError when passed a non-object", () => {
    expect(() => parseProject(42)).toThrow(ZodError)
  })

  it("strips unknown fields from output", () => {
    expect(parseProject({ extend: false, unknown: "field" })).toEqual({
      extend: false,
      doctypes: {},
    })
  })

  it("strips $schema property from output", () => {
    expect(
      parseProject({ $schema: "./resources/mcm-project.schema.json" }),
    ).toEqual({
      extend: false,
      doctypes: {},
    })
  })

  it("accepts a valid doctype entry", () => {
    const result = parseProject({ doctypes: { notes: { dir: "/some/path" } } })
    expect(result.doctypes).toEqual({
      notes: {
        dir: "/some/path",
        sequenceScheme: "000",
        sequenceSeparator: ".",
      },
    })
  })

  it("throws ZodError for doctype key with invalid character (space)", () => {
    expect(() =>
      parseProject({ doctypes: { "my notes": { dir: "/path" } } }),
    ).toThrow(ZodError)
  })

  it("throws ZodError for doctype key with invalid character (!)", () => {
    expect(() =>
      parseProject({ doctypes: { "bad!key": { dir: "/path" } } }),
    ).toThrow(ZodError)
  })

  it("throws ZodError when doctype value is missing dir", () => {
    expect(() => parseProject({ doctypes: { notes: {} } })).toThrow(ZodError)
  })

  it("throws ZodError when doctype dir is wrong type", () => {
    expect(() => parseProject({ doctypes: { notes: { dir: 42 } } })).toThrow(
      ZodError,
    )
  })

  it("strips unknown fields inside doctype value", () => {
    const result = parseProject({
      doctypes: { notes: { dir: "/path", extra: "ignored" } },
    })
    expect(result.doctypes.notes).toEqual({
      dir: "/path",
      sequenceScheme: "000",
      sequenceSeparator: ".",
    })
  })

  it("applies default sequenceScheme and sequenceSeparator when omitted", () => {
    const result = parseProject({ doctypes: { notes: { dir: "/path" } } })
    expect(result.doctypes.notes.sequenceScheme).toBe("000")
    expect(result.doctypes.notes.sequenceSeparator).toBe(".")
  })

  it("accepts sequenceScheme: 'none'", () => {
    const result = parseProject({
      doctypes: { notes: { dir: "/path", sequenceScheme: "none" } },
    })
    expect(result.doctypes.notes.sequenceScheme).toBe("none")
  })

  it("accepts sequenceScheme: 'datetime'", () => {
    const result = parseProject({
      doctypes: { notes: { dir: "/path", sequenceScheme: "datetime" } },
    })
    expect(result.doctypes.notes.sequenceScheme).toBe("datetime")
  })

  it("accepts zero-padded sequenceScheme strings", () => {
    for (const scheme of ["0", "00", "0000"]) {
      const result = parseProject({
        doctypes: { notes: { dir: "/path", sequenceScheme: scheme } },
      })
      expect(result.doctypes.notes.sequenceScheme).toBe(scheme)
    }
  })

  it("rejects invalid sequenceScheme values", () => {
    for (const scheme of ["abc", "123", "", "00x"]) {
      expect(() =>
        parseProject({
          doctypes: { notes: { dir: "/path", sequenceScheme: scheme } },
        }),
      ).toThrow(ZodError)
    }
  })

  it("accepts custom sequenceSeparator values", () => {
    for (const sep of ["-", "_", " - "]) {
      const result = parseProject({
        doctypes: { notes: { dir: "/path", sequenceSeparator: sep } },
      })
      expect(result.doctypes.notes.sequenceSeparator).toBe(sep)
    }
  })

  it("rejects invalid sequenceSeparator values", () => {
    for (const sep of ["", "/"]) {
      expect(() =>
        parseProject({
          doctypes: { notes: { dir: "/path", sequenceSeparator: sep } },
        }),
      ).toThrow(ZodError)
    }
  })
})

describe("locateProjectFile", () => {
  it("finds .mcm.json in cwd", () => {
    const start = join(fixtures, "with-config")
    expect(locateProjectFile(start)).toBe(join(start, ".mcm.json"))
  })

  it("finds .mcm.json in ancestor directory", () => {
    const start = join(fixtures, "with-config", "nested", "deeply")
    expect(locateProjectFile(start)).toBe(
      join(fixtures, "with-config", ".mcm.json"),
    )
  })

  it("returns null when no config exists", () => {
    const start = join(fixtures, "without-config", "nested", "deeply")
    expect(locateProjectFile(start)).toBeNull()
  })

  const isRoot = process.getuid?.() === 0

  it.skipIf(isRoot)("returns null on permission error", () => {
    const noAccess = join(workspace, "no-access")
    const child = join(noAccess, "child")
    mkdirSync(child, { recursive: true })
    chmodSync(noAccess, 0o000)

    try {
      expect(locateProjectFile(child)).toBeNull()
    } finally {
      chmodSync(noAccess, 0o755)
    }
  })
})

describe("loadProjectOrFail", () => {
  const docFixtures = join(import.meta.dirname, "../../test/fixtures/doctypes")

  it("resolves relative dir relative to project file directory", () => {
    const project = loadProjectOrFail(
      join(docFixtures, "relative-dir", ".mcm.json"),
    )
    expect(project.doctypes.notes.dir).toBe(
      join(docFixtures, "relative-dir", "my-docs"),
    )
  })

  it("keeps absolute dir unchanged", () => {
    const project = loadProjectOrFail(
      join(docFixtures, "absolute-dir", ".mcm.json"),
    )
    expect(project.doctypes.notes.dir).toBe("/absolute/path")
  })

  it("returns empty doctypes when none configured", () => {
    const project = loadProjectOrFail(
      join(docFixtures, "no-doctypes", ".mcm.json"),
    )
    expect(project.doctypes).toEqual({})
  })

  it("includes projectFile and projectDir in returned object", () => {
    const filePath = join(docFixtures, "relative-dir", ".mcm.json")
    const project = loadProjectOrFail(filePath)
    expect(project.projectFile).toBe(resolve(filePath))
    expect(project.projectDir).toBe(resolve(join(docFixtures, "relative-dir")))
  })
})

describe("getProject", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("aborts when no project file is found", () => {
    vi.mocked(cli.abortError).mockImplementation(() => {
      throw new Error("abortError")
    })
    vi.spyOn(process, "cwd").mockReturnValue(
      join(fixtures, "without-config", "nested", "deeply"),
    )

    expect(() => getProject()).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Could not find .mcm.json configuration file",
    )
  })
})
