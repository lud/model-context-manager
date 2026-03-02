import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"
import {
  loadRawProject,
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
    expect(parseProject({})).toEqual({ extend: false, doctypes: {}, sync: [] })
  })

  it("respects extend: true when provided", () => {
    expect(parseProject({ extend: true })).toEqual({
      extend: true,
      doctypes: {},
      sync: [],
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
      sync: [],
    })
  })

  it("strips $schema property from output", () => {
    expect(
      parseProject({ $schema: "./resources/mcm-project.schema.json" }),
    ).toEqual({
      extend: false,
      doctypes: {},
      sync: [],
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

describe("parseProject subcontexts", () => {
  it("accepts valid subcontexts config", () => {
    const result = parseProject({
      doctypes: { notes: { dir: "notes" } },
      subcontexts: { dir: "features", doctypes: ["notes"] },
    })
    expect(result.subcontexts).toEqual({
      dir: "features",
      doctypes: ["notes"],
    })
  })

  it("subcontexts is optional", () => {
    const result = parseProject({})
    expect(result.subcontexts).toBeUndefined()
  })

  it("throws when subcontexts.doctypes is empty", () => {
    expect(() =>
      parseProject({
        doctypes: { notes: { dir: "notes" } },
        subcontexts: { dir: "features", doctypes: [] },
      }),
    ).toThrow(ZodError)
  })
})

describe("parseProject sync", () => {
  it("gives sync: [] by default", () => {
    expect(parseProject({}).sync).toEqual([])
  })

  it("accepts string upstream", () => {
    const result = parseProject({
      sync: [{ upstream: "../data", local: "lib/data" }],
    })
    expect(result.sync[0].upstream).toBe("../data")
    expect(result.sync[0].mode).toBe("receive_merge")
  })

  it("accepts GitHub object upstream", () => {
    const result = parseProject({
      sync: [
        {
          upstream: { github: "owner/repo", path: "src/lib" },
          local: "vendor/lib",
        },
      ],
    })
    expect(result.sync[0].upstream).toEqual({
      github: "owner/repo",
      path: "src/lib",
    })
  })

  it("throws when local is missing", () => {
    expect(() => parseProject({ sync: [{ upstream: "../data" }] })).toThrow(
      ZodError,
    )
  })

  it("throws for invalid mode", () => {
    expect(() =>
      parseProject({
        sync: [{ upstream: "../data", local: "lib", mode: "bad" }],
      }),
    ).toThrow(ZodError)
  })

  it("defaults mode to receive_merge", () => {
    const result = parseProject({
      sync: [{ upstream: "../data", local: "lib/data" }],
    })
    expect(result.sync[0].mode).toBe("receive_merge")
  })

  it("accepts receive_mirror mode", () => {
    const result = parseProject({
      sync: [
        { upstream: "../data", local: "lib/data", mode: "receive_mirror" },
      ],
    })
    expect(result.sync[0].mode).toBe("receive_mirror")
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

describe("loadRawProject", () => {
  it("resolves relative dir relative to project file directory", () => {
    const project = loadRawProject(
      { doctypes: { notes: { dir: "my-docs" } } },
      "/some/project/.mcm.json",
    )
    expect(project.doctypes.notes.dir).toBe("/some/project/my-docs")
  })

  it("keeps absolute dir unchanged", () => {
    const project = loadRawProject(
      { doctypes: { notes: { dir: "/absolute/path" } } },
      "/some/project/.mcm.json",
    )
    expect(project.doctypes.notes.dir).toBe("/absolute/path")
  })

  it("returns empty doctypes when none configured", () => {
    const project = loadRawProject({}, "/some/project/.mcm.json")
    expect(project.doctypes).toEqual({})
  })

  it("includes projectFile and projectDir in returned object", () => {
    const project = loadRawProject({}, "/some/project/.mcm.json")
    expect(project.projectFile).toBe("/some/project/.mcm.json")
    expect(project.projectDir).toBe("/some/project")
  })

  it("sets currentSubcontext to false when no subcontext provided", () => {
    const project = loadRawProject({}, "/some/project/.mcm.json")
    expect(project.currentSubcontext).toBe(false)
  })

  it("sets inSubcontext false on all doctypes when no subcontexts configured", () => {
    const project = loadRawProject(
      { doctypes: { notes: { dir: "notes" } } },
      "/some/project/.mcm.json",
    )
    for (const entry of Object.values(project.doctypes)) {
      expect(entry.inSubcontext).toBe(false)
    }
  })

  it("stores rawConfig on the returned object", () => {
    const project = loadRawProject(
      { doctypes: { notes: { dir: "notes" } } },
      "/some/project/.mcm.json",
    )
    expect(project.rawConfig.doctypes.notes.dir).toBe("notes")
  })

  it("throws ZodError for invalid raw input", () => {
    expect(() =>
      loadRawProject({ extend: "bad" }, "/some/project/.mcm.json"),
    ).toThrow(ZodError)
  })
})

describe("loadRawProject with subcontexts", () => {
  const projectFile = "/some/project/.mcm.json"
  const raw = {
    doctypes: {
      notes: { dir: "notes" },
      devlogs: { dir: "context/devlogs" },
    },
    subcontexts: { dir: "features", doctypes: ["notes"] },
  }

  it("marks managed doctypes with inSubcontext true", () => {
    const project = loadRawProject(raw, projectFile)
    expect(project.doctypes.notes.inSubcontext).toBe(true)
    expect(project.doctypes.devlogs.inSubcontext).toBe(false)
  })

  it("resolves managed doctype dir through subcontext when provided", () => {
    const project = loadRawProject(raw, projectFile, {
      subcontext: "001.test-feature",
    })
    expect(project.doctypes.notes.dir).toBe(
      "/some/project/features/001.test-feature/notes",
    )
    expect(project.currentSubcontext).toBe("001.test-feature")
  })

  it("resolves non-managed doctype dir normally even with subcontext", () => {
    const project = loadRawProject(raw, projectFile, {
      subcontext: "001.test-feature",
    })
    expect(project.doctypes.devlogs.dir).toBe("/some/project/context/devlogs")
  })

  it("resolves managed doctype dir normally when no subcontext provided", () => {
    const project = loadRawProject(raw, projectFile)
    expect(project.doctypes.notes.dir).toBe("/some/project/notes")
  })

  it("throws when subcontexts references nonexistent doctype", () => {
    expect(() =>
      loadRawProject(
        {
          doctypes: { notes: { dir: "notes" } },
          subcontexts: { dir: "features", doctypes: ["nonexistent"] },
        },
        projectFile,
      ),
    ).toThrow('Subcontexts references unknown doctype: "nonexistent"')
  })
})

describe("loadRawProject GitHub repo normalization", () => {
  const raw = {
    sync: [
      {
        upstream: { github: "https://github.com/owner/repo", path: "docs" },
        local: "vendor/a",
      },
      {
        upstream: { github: "https://github.com/owner/repo.git", path: "docs" },
        local: "vendor/b",
      },
      {
        upstream: { github: "http://github.com/owner/repo", path: "docs" },
        local: "vendor/c",
      },
      { upstream: { github: "owner/repo", path: "docs" }, local: "vendor/d" },
    ],
  }

  function getRepos() {
    return loadRawProject(raw, "/p/.mcm.json").sync.map((s) => {
      if (s.upstream.kind !== "github") throw new Error("expected github")
      return s.upstream.repo
    })
  }

  it('normalizes "https://github.com/owner/repo" to "owner/repo"', () => {
    expect(getRepos()[0]).toBe("owner/repo")
  })

  it('normalizes "https://github.com/owner/repo.git" to "owner/repo"', () => {
    expect(getRepos()[1]).toBe("owner/repo")
  })

  it('normalizes "http://github.com/owner/repo" to "owner/repo"', () => {
    expect(getRepos()[2]).toBe("owner/repo")
  })

  it('passes through "owner/repo" unchanged', () => {
    expect(getRepos()[3]).toBe("owner/repo")
  })
})

describe("loadRawProject sync resolution", () => {
  const projectFile = "/some/project/.mcm.json"
  const raw = {
    sync: [
      { upstream: "../some-source", local: "local-copy" },
      {
        upstream: "/absolute/source",
        local: "abs-local",
        mode: "receive_mirror",
      },
      {
        upstream: { github: "owner/repo", path: "/src/lib" },
        local: "vendor/lib",
      },
    ],
  }

  it("resolves relative string upstream to absolute path", () => {
    const project = loadRawProject(raw, projectFile)
    const spec = project.sync.find(
      (s) => s.upstream.kind === "localfs" && s.local.endsWith("local-copy"),
    )!
    expect(spec.upstream).toEqual({
      kind: "localfs",
      path: "/some/some-source",
    })
  })

  it("keeps absolute string upstream unchanged", () => {
    const project = loadRawProject(raw, projectFile)
    const spec = project.sync.find(
      (s) =>
        s.upstream.kind === "localfs" &&
        (s.upstream as { path: string }).path === "/absolute/source",
    )!
    expect(spec.upstream).toEqual({ kind: "localfs", path: "/absolute/source" })
  })

  it("resolves GitHub upstream with leading slash trimmed from path", () => {
    const project = loadRawProject(raw, projectFile)
    const spec = project.sync.find((s) => s.upstream.kind === "github")!
    expect(spec.upstream).toEqual({
      kind: "github",
      repo: "owner/repo",
      path: "src/lib",
    })
  })

  it("resolves relative local to absolute path", () => {
    const project = loadRawProject(raw, projectFile)
    expect(project.sync[0].local).toBe("/some/project/local-copy")
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
