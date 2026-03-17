import { describe, expect, it, vi } from "vitest"
import { resolve, join } from "node:path"
import {
  resolveFileArg,
  resolveFromDoctypeAndId,
  resolveFromPath,
} from "./resolve-file.js"
import * as cli from "./cli.js"
import * as projectModule from "./project.js"
import { DoctypeRole } from "./project.js"
import type { ResolvedProject, DoctypeFileEntry } from "./project.js"

vi.mock("./cli.js")
vi.mock("./project.js")

vi.mocked(cli.abortError).mockImplementation((msg: string) => {
  throw new Error(msg)
})

const fixtureBase = resolve("test/fixtures")
const noSubcontextDir = join(fixtureBase, "status/no-subcontext")
const multiSubcontextDir = join(fixtureBase, "doctypes/multi-subcontext")

function makeProject(
  overrides: Partial<ResolvedProject> = {},
): ResolvedProject {
  return {
    extend: false,
    doctypes: {},
    sync: [],
    subcontextDoctype: undefined,
    managedDoctypes: [],
    projectFile: "/mock/.mcm.json",
    projectDir: "/mock",
    rawConfig: {
      extend: false,
      doctypes: {},
      sync: [],
      managedDoctypes: [],
    },
    currentSubcontext: false,
    ...overrides,
  }
}

describe("resolveFromDoctypeAndId", () => {
  describe("zeroes scheme", () => {
    const notesDir = join(noSubcontextDir, "notes")
    const project = makeProject({
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

    it("matches by integer prefix (1 matches 001)", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([
        {
          dir: notesDir,
          files: ["001.meeting.md", "002.ideas.md", "003.research.md"],
        },
      ])

      const result = resolveFromDoctypeAndId(project, "notes", "1")
      expect(result).toBe(join(notesDir, "001.meeting.md"))
    })

    it("matches by padded prefix (001 matches 001)", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([
        { dir: notesDir, files: ["001.meeting.md", "002.ideas.md"] },
      ])

      const result = resolveFromDoctypeAndId(project, "notes", "001")
      expect(result).toBe(join(notesDir, "001.meeting.md"))
    })

    it("falls back to slug match when prefix not found", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([
        { dir: notesDir, files: ["001.meeting.md", "002.ideas.md"] },
      ])

      const result = resolveFromDoctypeAndId(project, "notes", "ideas")
      expect(result).toBe(join(notesDir, "002.ideas.md"))
    })

    it("aborts when nothing matches", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([{ dir: notesDir, files: ["001.meeting.md"] }])

      expect(() => resolveFromDoctypeAndId(project, "notes", "nope")).toThrow(
        'Could not find file matching "nope" in doctype "notes"',
      )
    })
  })

  describe("none scheme", () => {
    const notesDir = "/mock/notes"
    const project = makeProject({
      doctypes: {
        notes: {
          dir: notesDir,
          sequenceScheme: "none",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    it("matches by exact slug (no prefix)", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([{ dir: notesDir, files: ["apple.md", "banana.md"] }])

      const result = resolveFromDoctypeAndId(project, "notes", "banana")
      expect(result).toBe(join(notesDir, "banana.md"))
    })
  })

  describe("datetime scheme", () => {
    const notesDir = "/mock/notes"
    const project = makeProject({
      doctypes: {
        notes: {
          dir: notesDir,
          sequenceScheme: "datetime",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    it("matches by exact datetime prefix", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([
        {
          dir: notesDir,
          files: ["20240101120000.meeting.md", "20240201090000.ideas.md"],
        },
      ])

      const result = resolveFromDoctypeAndId(project, "notes", "20240101120000")
      expect(result).toBe(join(notesDir, "20240101120000.meeting.md"))
    })

    it("falls back to slug when datetime prefix not found", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([
        { dir: notesDir, files: ["20240101120000.meeting.md"] },
      ])

      const result = resolveFromDoctypeAndId(project, "notes", "meeting")
      expect(result).toBe(join(notesDir, "20240101120000.meeting.md"))
    })
  })

  describe("managed doctypes across subcontexts", () => {
    const featuresDir = join(multiSubcontextDir, "features")
    const project = makeProject({
      projectDir: multiSubcontextDir,
      projectFile: join(multiSubcontextDir, ".mcm.json"),
      subcontextDoctype: "features",
      managedDoctypes: ["notes"],
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
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          dir: join(featuresDir, "001.feature-a/notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
      },
    })

    it("finds file across subcontexts by prefix", () => {
      vi.mocked(
        projectModule.listDoctypeFilesAcrossSubcontexts,
      ).mockReturnValue([
        {
          dir: join(featuresDir, "001.feature-a/notes"),
          files: ["001.intro.md", "003.design.md"],
        },
        {
          dir: join(featuresDir, "002.feature-b/notes"),
          files: ["001.login.md", "002.auth.md"],
        },
      ])

      // Note: prefix 3 matches 003.design.md in feature-a
      const result = resolveFromDoctypeAndId(project, "notes", "3")
      expect(result).toBe(
        join(featuresDir, "001.feature-a/notes", "003.design.md"),
      )
    })
  })
})

describe("resolveFromPath", () => {
  const notesDir = join(noSubcontextDir, "notes")
  const project = makeProject({
    projectDir: noSubcontextDir,
    projectFile: join(noSubcontextDir, ".mcm.json"),
    doctypes: {
      notes: {
        dir: notesDir,
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Regular,
      },
      tasks: {
        dir: join(noSubcontextDir, "tasks"),
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Regular,
      },
    },
  })

  it("resolves absolute path that belongs to a doctype", () => {
    const absPath = join(notesDir, "001.meeting.md")
    const result = resolveFromPath(project, absPath, "/somewhere/else")
    expect(result).toBe(absPath)
  })

  it("resolves relative path from cwd", () => {
    const result = resolveFromPath(
      project,
      "notes/001.meeting.md",
      noSubcontextDir,
    )
    expect(result).toBe(join(notesDir, "001.meeting.md"))
  })

  it("falls back to projectDir when cwd doesn't match", () => {
    const result = resolveFromPath(
      project,
      "notes/001.meeting.md",
      "/somewhere/else",
    )
    expect(result).toBe(join(notesDir, "001.meeting.md"))
  })

  it("aborts when file doesn't exist anywhere", () => {
    expect(() =>
      resolveFromPath(project, "notes/nonexistent.md", "/somewhere/else"),
    ).toThrow("File not found")
  })

  it("aborts when file exists but is not in any doctype", () => {
    // The .mcm.json file exists but is not in a doctype directory
    expect(() =>
      resolveFromPath(project, ".mcm.json", noSubcontextDir),
    ).toThrow("File is not part of any doctype")
  })
})

describe("resolveFromPath with subcontexts", () => {
  const featuresDir = join(multiSubcontextDir, "features")
  const project = makeProject({
    projectDir: multiSubcontextDir,
    projectFile: join(multiSubcontextDir, ".mcm.json"),
    subcontextDoctype: "features",
    managedDoctypes: ["notes"],
    rawConfig: {
      extend: false,
      doctypes: {
        features: {
          dir: "features",
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
        notes: { dir: "notes", sequenceScheme: "000", sequenceSeparator: "." },
      },
      sync: [],
      subcontextDoctype: "features",
      managedDoctypes: ["notes"],
    },
    doctypes: {
      features: {
        dir: featuresDir,
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Subcontext,
      },
      notes: {
        dir: join(featuresDir, "001.feature-a/notes"),
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Managed,
      },
    },
  })

  it("resolves a managed doctype file by path", () => {
    const result = resolveFromPath(
      project,
      "features/001.feature-a/notes/001.intro.md",
      multiSubcontextDir,
    )
    expect(result).toBe(join(featuresDir, "001.feature-a/notes/001.intro.md"))
  })

  it("resolves a subcontext brief file by path", () => {
    const result = resolveFromPath(
      project,
      "features/001.feature-a/001.feature-a.md",
      multiSubcontextDir,
    )
    expect(result).toBe(join(featuresDir, "001.feature-a/001.feature-a.md"))
  })
})

describe("resolveFromPath edge cases", () => {
  it("aborts when absolute path does not exist", () => {
    const project = makeProject({
      projectDir: noSubcontextDir,
      doctypes: {
        notes: {
          dir: join(noSubcontextDir, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    expect(() =>
      resolveFromPath(project, "/nonexistent/path/file.md", "/tmp"),
    ).toThrow("File not found: /nonexistent/path/file.md")
  })

  it("validates managed doctype file in a different subcontext than current", () => {
    // Project is resolved with feature-a as current subcontext,
    // but the file is in feature-b. The direct doctype dir match won't hit,
    // so it must go through the managed doctype validation path.
    const featuresDir = join(multiSubcontextDir, "features")
    const project = makeProject({
      projectDir: multiSubcontextDir,
      projectFile: join(multiSubcontextDir, ".mcm.json"),
      subcontextDoctype: "features",
      managedDoctypes: ["notes"],
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
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          // Current subcontext is feature-a
          dir: join(featuresDir, "001.feature-a/notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
      },
    })

    // But the file is in feature-b
    const result = resolveFromPath(
      project,
      "features/002.feature-b/notes/001.login.md",
      multiSubcontextDir,
    )
    expect(result).toBe(join(featuresDir, "002.feature-b/notes/001.login.md"))
  })
})

describe("resolveFileArg", () => {
  const notesDir = join(noSubcontextDir, "notes")
  const project = makeProject({
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

  it("dispatches two args to resolveFromDoctypeAndId", () => {
    vi.mocked(projectModule.listDoctypeFilesAcrossSubcontexts).mockReturnValue([
      { dir: notesDir, files: ["001.meeting.md"] },
    ])

    const result = resolveFileArg(project, ["notes", "1"], "/tmp")
    expect(result).toBe(join(notesDir, "001.meeting.md"))
  })

  it("dispatches single arg to resolveFromPath", () => {
    const result = resolveFileArg(
      project,
      [join(notesDir, "001.meeting.md")],
      "/tmp",
    )
    expect(result).toBe(join(notesDir, "001.meeting.md"))
  })

  it("aborts on unknown doctype with two args", () => {
    expect(() => resolveFileArg(project, ["unknown", "1"], "/tmp")).toThrow(
      "Unknown doctype: unknown",
    )
  })
})
