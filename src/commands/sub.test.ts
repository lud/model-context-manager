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
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as cli from "../lib/cli.js"
import { subAdd, subSwitch, subList, subCurrent } from "./sub.js"
import { mockProject } from "../lib/project.test-helpers.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/project.js")>()
  return { ...actual, getProject: vi.fn() }
})

const workspace = mkdtempSync(join(tmpdir(), "mcm-test-sub-"))
const projectDir = join(workspace, "project")
const featuresDir = join(projectDir, "features")
const projectFile = join(projectDir, ".mcm.json")

// Mock global config storage in memory
let storedSubcontexts: Record<string, string> = {}

vi.mock("../lib/global-config.js", () => ({
  getCurrentSubcontext: (dir: string) => storedSubcontexts[dir],
  setCurrentSubcontext: (dir: string, name: string) => {
    storedSubcontexts[dir] = name
  },
}))

beforeEach(() => {
  storedSubcontexts = {}
  rmSync(featuresDir, { recursive: true, force: true })
  mkdirSync(featuresDir, { recursive: true })
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(
    projectFile,
    JSON.stringify({
      doctypes: {
        notes: { dir: "notes" },
        devlogs: { dir: "context/devlogs" },
      },
      subcontexts: { dir: "features", doctypes: ["notes"] },
    }),
  )

  vi.mocked(cli.abortError).mockImplementation(() => {
    throw new Error("abortError")
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

function mockSubProject() {
  mockProject({
    projectFile: projectFile,
    projectDir: projectDir,
    rawConfig: {
      extend: false,
      sync: [],
      doctypes: {
        notes: { dir: "notes", sequenceScheme: "000", sequenceSeparator: "." },
        devlogs: {
          dir: "context/devlogs",
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
      subcontexts: { dir: "features", doctypes: ["notes"] },
    },
    subcontexts: { dir: "features", doctypes: ["notes"] },
    doctypes: {
      notes: {
        dir: join(projectDir, "notes"),
        sequenceScheme: "000",
        sequenceSeparator: ".",
        inSubcontext: true,
      },
      devlogs: {
        dir: join(projectDir, "context", "devlogs"),
        sequenceScheme: "000",
        sequenceSeparator: ".",
        inSubcontext: false,
      },
    },
  })
}

describe("sub add", () => {
  it("creates subcontext directory and doctype subdirs", () => {
    mockSubProject()

    subAdd(["my", "feature"])

    expect(existsSync(join(featuresDir, "001.my-feature"))).toBe(true)
    expect(existsSync(join(featuresDir, "001.my-feature", "notes"))).toBe(true)
  })

  it("auto-selects the new subcontext", () => {
    mockSubProject()

    subAdd(["test"])

    expect(storedSubcontexts[projectDir]).toBe("001.test")
  })

  it("prints the created directory path", () => {
    mockSubProject()

    subAdd(["test"])

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.test"),
    )
  })

  it("increments number from existing subcontexts", () => {
    mkdirSync(join(featuresDir, "001.first"))
    mockSubProject()

    subAdd(["second"])

    expect(existsSync(join(featuresDir, "002.second"))).toBe(true)
  })

  it("aborts with no args", () => {
    mockSubProject()

    expect(() => subAdd([])).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("Usage"),
    )
  })

  it("aborts when no subcontexts configured", () => {
    mockProject({
      projectFile: join(projectDir, ".mcm.json"),
      projectDir: projectDir,
    })

    expect(() => subAdd(["test"])).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "No subcontexts configured in .mcm.json",
    )
  })
})

describe("sub switch", () => {
  it("switches by number", () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    mockSubProject()

    subSwitch(["1"])

    expect(storedSubcontexts[projectDir]).toBe("001.alpha")
    expect(cli.writeln).toHaveBeenCalledWith("001.alpha")
  })

  it("switches by fuzzy name", () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    mockSubProject()

    subSwitch(["alp"])

    expect(storedSubcontexts[projectDir]).toBe("001.alpha")
  })

  it("aborts on not found", () => {
    mockSubProject()

    expect(() => subSwitch(["nope"])).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
    )
  })

  it("aborts on multiple matches", () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    mkdirSync(join(featuresDir, "002.also"))
    mockSubProject()

    expect(() => subSwitch(["a"])).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("Multiple"),
    )
  })

  it("aborts with no args", () => {
    mockSubProject()

    expect(() => subSwitch([])).toThrow("abortError")
  })
})

describe("sub list", () => {
  it("lists subcontexts with current marker", () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    mkdirSync(join(featuresDir, "002.beta"))
    storedSubcontexts[projectDir] = "001.alpha"
    mockSubProject()

    subList()

    const calls = vi.mocked(cli.writeln).mock.calls.map((c) => c[0])
    expect(calls).toContain("001.alpha *")
    expect(calls).toContain("002.beta")
  })

  it("shows warning when no subcontexts exist", () => {
    mockSubProject()

    subList()

    expect(cli.warning).toHaveBeenCalledWith("No subcontexts found.")
  })
})

describe("sub current", () => {
  it("prints current subcontext path", () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    storedSubcontexts[projectDir] = "001.alpha"
    mockSubProject()

    subCurrent()

    expect(cli.writeln).toHaveBeenCalledWith(
      expect.stringContaining("001.alpha"),
    )
  })

  it("aborts when no subcontext selected", () => {
    mockSubProject()

    expect(() => subCurrent()).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("No subcontext selected"),
    )
  })
})
