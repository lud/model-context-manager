import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as p from "@clack/prompts"
import * as cli from "../lib/cli.js"
import { subSwitch, subCurrent } from "./sub.js"
import { mockProject } from "../lib/project.test-helpers.js"
import { DoctypeRole } from "../lib/project.js"

vi.mock("@clack/prompts")
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
        features: { dir: "features" },
        notes: { dir: "notes" },
        devlogs: { dir: "context/devlogs" },
      },
      subcontextDoctype: "features",
      managedDoctypes: ["notes"],
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
        features: {
          dir: "features",
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
        notes: { dir: "notes", sequenceScheme: "000", sequenceSeparator: "." },
        devlogs: {
          dir: "context/devlogs",
          sequenceScheme: "000",
          sequenceSeparator: ".",
        },
      },
      subcontextDoctype: "features",
      managedDoctypes: ["notes"],
    },
    subcontextDoctype: "features",
    managedDoctypes: ["notes"],
    doctypes: {
      features: {
        dir: featuresDir,
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Subcontext,
      },
      notes: {
        dir: join(projectDir, "notes"),
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Managed,
      },
      devlogs: {
        dir: join(projectDir, "context", "devlogs"),
        sequenceScheme: "000",
        sequenceSeparator: ".",
        role: DoctypeRole.Regular,
      },
    },
  })
}

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

  it("aborts on not found", async () => {
    mockSubProject()

    await expect(subSwitch(["nope"])).rejects.toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
    )
  })

  it("aborts on multiple matches", async () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    mkdirSync(join(featuresDir, "002.also"))
    mockSubProject()

    await expect(subSwitch(["a"])).rejects.toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      expect.stringContaining("Multiple"),
    )
  })

  it("shows prompt when no args given", async () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    mkdirSync(join(featuresDir, "002.beta"))
    mockSubProject()
    vi.mocked(p.select).mockResolvedValue("002.beta")
    vi.mocked(p.isCancel).mockReturnValue(false)

    await subSwitch([])

    expect(p.select).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [
          { value: "001.alpha", label: "001.alpha" },
          { value: "002.beta", label: "002.beta" },
        ],
      }),
    )
    expect(storedSubcontexts[projectDir]).toBe("002.beta")
    expect(cli.writeln).toHaveBeenCalledWith("002.beta")
  })

  it("cancels prompt gracefully", async () => {
    mkdirSync(join(featuresDir, "001.alpha"))
    mockSubProject()
    vi.mocked(p.select).mockResolvedValue(Symbol("cancel") as never)
    vi.mocked(p.isCancel).mockReturnValue(true)
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })

    await expect(subSwitch([])).rejects.toThrow("exit")
    expect(p.cancel).toHaveBeenCalledWith("Cancelled.")
  })

  it("aborts when no args and no subcontexts exist", async () => {
    mockSubProject()

    await expect(subSwitch([])).rejects.toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith("No subcontexts found.")
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

  it("aborts when no subcontext doctype configured", () => {
    mockProject({
      projectFile: join(projectDir, ".mcm.json"),
      projectDir: projectDir,
    })

    expect(() => subCurrent()).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "No subcontext doctype configured in .mcm.json",
    )
  })
})
