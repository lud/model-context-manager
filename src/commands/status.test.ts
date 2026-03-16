import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { DoctypeRole } from "../lib/project.js"
import {
  countDoctype,
  countScopedManaged,
  formatCountLines,
  printStatus,
  statusCommand,
  type DoctypeCounts,
} from "./status.js"
import type { ResolvedProject } from "../lib/project.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")

const noSubcontextFixture = join(
  import.meta.dirname,
  "../../test/fixtures/status/no-subcontext",
)

const withSubcontextFixture = join(
  import.meta.dirname,
  "../../test/fixtures/status/with-subcontext",
)

beforeEach(() => {
  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// formatCountLines — pure unit tests
// ---------------------------------------------------------------------------

describe("formatCountLines", () => {
  it("formats two lines with padding", () => {
    const counts: DoctypeCounts = {
      total: 5,
      active: 3,
      done: 2,
      none: 0,
      other: 0,
      namedStatuses: {},
    }
    const lines = formatCountLines("notes", counts, 10)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^\s+notes\s+active\s+3$/)
    expect(lines[1]).toMatch(/^\s+notes\s+done\s+2$/)
  })

  it("formats zero counts", () => {
    const counts: DoctypeCounts = {
      total: 0,
      active: 0,
      done: 0,
      none: 0,
      other: 0,
      namedStatuses: {},
    }
    const lines = formatCountLines("tasks", counts, 5)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^\s+tasks\s+active\s+0$/)
    expect(lines[1]).toMatch(/^\s+tasks\s+done\s+0$/)
  })

  it("prints active breakdown as none, named, other", () => {
    const counts: DoctypeCounts = {
      total: 9,
      active: 6,
      done: 3,
      none: 2,
      other: 1,
      namedStatuses: { specified: 3, done: 3 },
    }
    const lines = formatCountLines("specs", counts, 5)
    expect(lines).toEqual([
      "  specs  active    6 - (none) 2, specified 3, (other) 1",
      "  specs  done      3",
    ])
  })
})

// ---------------------------------------------------------------------------
// countDoctype — integration tests with fixtures
// ---------------------------------------------------------------------------

describe("countDoctype — no subcontext", () => {
  function setupNoSubcontext() {
    const project = {
      currentSubcontext: false,
      projectDir: noSubcontextFixture,
      projectFile: join(noSubcontextFixture, ".mcm.json"),
      rawConfig: {
        extend: false,
        doctypes: {
          notes: {
            dir: "notes",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          tasks: {
            dir: "tasks",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        managedDoctypes: [],
      },
      doctypes: {
        notes: {
          dir: join(noSubcontextFixture, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
        tasks: {
          dir: join(noSubcontextFixture, "tasks"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
      sync: [],
      managedDoctypes: [],
    } as unknown as ResolvedProject
    mockProject(project)
    return project
  }

  it("counts notes: 2 active, 1 done", () => {
    const project = setupNoSubcontext()
    const counts = countDoctype(project, "notes")
    expect(counts).toEqual({
      total: 3,
      active: 2,
      done: 1,
      none: 1,
      other: 0,
      namedStatuses: {},
    })
  })

  it("counts tasks: 0 active, 2 done", () => {
    const project = setupNoSubcontext()
    const counts = countDoctype(project, "tasks")
    expect(counts).toEqual({
      total: 2,
      active: 0,
      done: 2,
      none: 0,
      other: 0,
      namedStatuses: {},
    })
  })
})

describe("countDoctype — with subcontext (global counts)", () => {
  function setupWithSubcontext() {
    const featuresDir = join(withSubcontextFixture, "features")
    const project = {
      currentSubcontext: false,
      projectDir: withSubcontextFixture,
      projectFile: join(withSubcontextFixture, ".mcm.json"),
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
          tasks: {
            dir: "tasks",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          devlogs: {
            dir: "devlogs",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: ["notes", "tasks"],
      },
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          dir: join(withSubcontextFixture, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
        tasks: {
          dir: join(withSubcontextFixture, "tasks"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
        devlogs: {
          dir: join(withSubcontextFixture, "devlogs"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
      sync: [],
      subcontextDoctype: "features",
      managedDoctypes: ["notes", "tasks"],
    } as unknown as ResolvedProject
    mockProject(project)
    return project
  }

  it("counts features (subcontext briefs): 1 active, 1 done", () => {
    const project = setupWithSubcontext()
    const counts = countDoctype(project, "features")
    expect(counts).toEqual({
      total: 2,
      active: 1,
      done: 1,
      none: 0,
      other: 0,
      namedStatuses: {},
    })
  })

  it("counts notes across all subcontexts: 1 active, 2 done", () => {
    const project = setupWithSubcontext()
    const counts = countDoctype(project, "notes")
    expect(counts).toEqual({
      total: 3,
      active: 1,
      done: 2,
      none: 0,
      other: 0,
      namedStatuses: {},
    })
  })

  it("counts tasks across all subcontexts: 1 active, 0 done", () => {
    const project = setupWithSubcontext()
    const counts = countDoctype(project, "tasks")
    expect(counts).toEqual({
      total: 1,
      active: 1,
      done: 0,
      none: 0,
      other: 0,
      namedStatuses: {},
    })
  })

  it("counts devlogs (regular): 2 active, 0 done", () => {
    const project = setupWithSubcontext()
    const counts = countDoctype(project, "devlogs")
    expect(counts).toEqual({
      total: 2,
      active: 2,
      done: 0,
      none: 1,
      other: 0,
      namedStatuses: {},
    })
  })
})

// ---------------------------------------------------------------------------
// countScopedManaged — scoped to active subcontext
// ---------------------------------------------------------------------------

describe("countScopedManaged", () => {
  it("counts only files in 001.auth subcontext", () => {
    const entry = {
      dir: join(withSubcontextFixture, "features", "001.auth", "notes"),
      sequenceScheme: "000",
      sequenceSeparator: ".",
      role: DoctypeRole.Managed,
    }
    const counts = countScopedManaged(entry)
    expect(counts).toEqual({
      total: 2,
      active: 1,
      done: 1,
      none: 0,
      other: 0,
      namedStatuses: {},
    })
  })

  it("counts tasks in 001.auth subcontext", () => {
    const entry = {
      dir: join(withSubcontextFixture, "features", "001.auth", "tasks"),
      sequenceScheme: "000",
      sequenceSeparator: ".",
      role: DoctypeRole.Managed,
    }
    const counts = countScopedManaged(entry)
    expect(counts).toEqual({
      total: 1,
      active: 1,
      done: 0,
      none: 0,
      other: 0,
      namedStatuses: {},
    })
  })

  it("counts notes in 002.payments subcontext", () => {
    const entry = {
      dir: join(withSubcontextFixture, "features", "002.payments", "notes"),
      sequenceScheme: "000",
      sequenceSeparator: ".",
      role: DoctypeRole.Managed,
    }
    const counts = countScopedManaged(entry)
    expect(counts).toEqual({
      total: 1,
      active: 0,
      done: 1,
      none: 0,
      other: 0,
      namedStatuses: {},
    })
  })
})

// ---------------------------------------------------------------------------
// printStatus — output tests
// ---------------------------------------------------------------------------

function capturedLines(): string[] {
  return vi.mocked(cli.writeln).mock.calls.map((c) => c[0])
}

describe("printStatus — no subcontext project", () => {
  it("prints counts for all doctypes", () => {
    const project = {
      currentSubcontext: false,
      projectDir: noSubcontextFixture,
      projectFile: join(noSubcontextFixture, ".mcm.json"),
      rawConfig: {
        extend: false,
        doctypes: {
          notes: {
            dir: "notes",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          tasks: {
            dir: "tasks",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        managedDoctypes: [],
      },
      doctypes: {
        notes: {
          dir: join(noSubcontextFixture, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
        tasks: {
          dir: join(noSubcontextFixture, "tasks"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
      sync: [],
      managedDoctypes: [],
    } as unknown as ResolvedProject

    printStatus(project)

    const lines = capturedLines()
    expect(lines).toHaveLength(8)
    expect(lines[0]).toMatch(/Current project:/)
    expect(lines[1]).toMatch(/notes\s+active\s+2\s+-\s+\(none\)\s+1/)
    expect(lines[2]).toMatch(/notes\s+done\s+1/)
    expect(lines[3]).toMatch(/tasks\s+active\s+0/)
    expect(lines[4]).toMatch(/tasks\s+done\s+2/)
    expect(lines[5]).toBe("")
    expect(lines[6]).toBe("Subcontext doctype: none")
    expect(lines[7]).toBe("Current subcontext: none")
  })

  it("prints subcontext metadata with no current subcontext", () => {
    const project = {
      currentSubcontext: false,
      projectDir: noSubcontextFixture,
      projectFile: join(noSubcontextFixture, ".mcm.json"),
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
        managedDoctypes: [],
      },
      doctypes: {
        notes: {
          dir: join(noSubcontextFixture, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
      sync: [],
      managedDoctypes: [],
    } as unknown as ResolvedProject

    printStatus(project)

    const lines = capturedLines()
    expect(lines).toContain("Subcontext doctype: none")
    expect(lines).toContain("Current subcontext: none")
  })
})

describe("printStatus — with active subcontext", () => {
  it("prints global counts then subcontext section", () => {
    const featuresDir = join(withSubcontextFixture, "features")
    const project = {
      currentSubcontext: "001.auth",
      projectDir: withSubcontextFixture,
      projectFile: join(withSubcontextFixture, ".mcm.json"),
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
          tasks: {
            dir: "tasks",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
          devlogs: {
            dir: "devlogs",
            sequenceScheme: "000",
            sequenceSeparator: ".",
          },
        },
        sync: [],
        subcontextDoctype: "features",
        managedDoctypes: ["notes", "tasks"],
      },
      doctypes: {
        features: {
          dir: featuresDir,
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Subcontext,
        },
        notes: {
          dir: join(featuresDir, "001.auth", "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
        tasks: {
          dir: join(featuresDir, "001.auth", "tasks"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Managed,
        },
        devlogs: {
          dir: join(withSubcontextFixture, "devlogs"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
      sync: [],
      subcontextDoctype: "features",
      managedDoctypes: ["notes", "tasks"],
    } as unknown as ResolvedProject
    mockProject(project)

    printStatus(project)

    const lines = capturedLines()

    // Project header
    expect(lines[0]).toMatch(/Current project:/)

    // Global counts (4 doctypes, 2 lines each)
    expect(lines[1]).toMatch(/features\s+active\s+1/)
    expect(lines[2]).toMatch(/features\s+done\s+1/)
    expect(lines[3]).toMatch(/notes\s+active\s+1/)
    expect(lines[4]).toMatch(/notes\s+done\s+2/)
    expect(lines[5]).toMatch(/tasks\s+active\s+1/)
    expect(lines[6]).toMatch(/tasks\s+done\s+0/)
    expect(lines[7]).toMatch(/devlogs\s+active\s+2\s+-\s+\(none\)\s+1/)
    expect(lines[8]).toMatch(/devlogs\s+done\s+0/)

    // Subcontext metadata and header
    expect(lines[9]).toBe("")
    expect(lines[10]).toBe("Subcontext doctype: features")
    expect(lines[11]).toMatch(/Current subcontext:.*001\.auth.*001\.auth\.md/)

    // Scoped managed counts (only notes + tasks in 001.auth, 2 lines each)
    expect(lines[12]).toMatch(/notes\s+active\s+1/)
    expect(lines[13]).toMatch(/notes\s+done\s+1/)
    expect(lines[14]).toMatch(/tasks\s+active\s+1/)
    expect(lines[15]).toMatch(/tasks\s+done\s+0/)
  })
})

describe("printStatus — no doctypes", () => {
  it("warns when no doctypes configured", () => {
    const project = {
      currentSubcontext: false,
      doctypes: {},
      rawConfig: { doctypes: {}, managedDoctypes: [], sync: [] },
    } as unknown as ResolvedProject

    printStatus(project)

    expect(cli.warning).toHaveBeenCalledWith("No doctypes configured.")
  })
})

// ---------------------------------------------------------------------------
// statusCommand integration
// ---------------------------------------------------------------------------

describe("statusCommand", () => {
  it("calls getProject and prints status", () => {
    mockProject({
      currentSubcontext: false,
      projectDir: noSubcontextFixture,
      projectFile: join(noSubcontextFixture, ".mcm.json"),
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
        managedDoctypes: [],
      },
      doctypes: {
        notes: {
          dir: join(noSubcontextFixture, "notes"),
          sequenceScheme: "000",
          sequenceSeparator: ".",
          role: DoctypeRole.Regular,
        },
      },
    })

    statusCommand.callback!({ _: {} })

    const lines = capturedLines()
    expect(lines).toHaveLength(6)
    expect(lines[0]).toMatch(/Current project:/)
    expect(lines[1]).toMatch(/notes\s+active\s+2\s+-\s+\(none\)\s+1/)
    expect(lines[2]).toMatch(/notes\s+done\s+1/)
    expect(lines[3]).toBe("")
    expect(lines[4]).toBe("Subcontext doctype: none")
    expect(lines[5]).toBe("Current subcontext: none")
  })
})
