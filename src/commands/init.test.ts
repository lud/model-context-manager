import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as p from "@clack/prompts"
import * as fs from "../lib/fs.js"
import * as project from "../lib/project.js"
import {
  buildDoctypeConfig,
  configToJson,
  mergeConfigs,
  runInit,
} from "./init.js"
import { getTemplates } from "../lib/templates.js"
import { SCHEMA_URL } from "../lib/schema-url.js"

vi.mock("@clack/prompts")
vi.mock("../lib/fs.js")
vi.mock("../lib/project.js")

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "mcm-init-test-"))
  vi.spyOn(process, "cwd").mockReturnValue(tempDir)
  vi.mocked(project.locateProjectFile).mockReturnValue(null)
  vi.mocked(fs.writeFileSyncOrAbort).mockReturnValue(undefined)
})

afterEach(() => {
  vi.spyOn(process, "cwd").mockRestore()
  rmSync(tempDir, { recursive: true, force: true })
  vi.resetAllMocks()
})

// Helper: write a real .mcm.json to tempDir
function writeProjectFile(content: object) {
  writeFileSync(join(tempDir, ".mcm.json"), JSON.stringify(content))
}

describe("getTemplates", () => {
  it("includes notes and feature-project templates", () => {
    const ids = getTemplates().map((t) => t.id)
    expect(ids).toContain("notes")
    expect(ids).toContain("feature-project")
  })

  it("does not include a blank template", () => {
    const ids = getTemplates().map((t) => t.id)
    expect(ids).not.toContain("blank")
  })

  it("feature-project template has subcontexts with specs and tasks", () => {
    const tmpl = getTemplates().find((t) => t.id === "feature-project")!
    expect(tmpl.config.subcontexts?.dir).toBe("features")
    expect(tmpl.config.subcontexts?.doctypes).toContain("specs")
    expect(tmpl.config.subcontexts?.doctypes).toContain("tasks")
  })
})

describe("buildDoctypeConfig", () => {
  it("omits sequenceScheme when scheme is 000 (default)", () => {
    const result = buildDoctypeConfig("notes", "notes", "000")
    expect(result).toEqual({ dir: "notes" })
    expect(result.sequenceScheme).toBeUndefined()
  })

  it("includes sequenceScheme for datetime", () => {
    const result = buildDoctypeConfig("notes", "notes", "datetime")
    expect(result.sequenceScheme).toBe("datetime")
  })

  it("includes sequenceScheme for none", () => {
    const result = buildDoctypeConfig("notes", "notes", "none")
    expect(result.sequenceScheme).toBe("none")
  })
})

describe("mergeConfigs", () => {
  it("merges doctypes from patch into base", () => {
    const base = { doctypes: { a: { dir: "a" } } }
    const patch = { doctypes: { b: { dir: "b" } } }
    const result = mergeConfigs(base, patch)
    expect(result.doctypes).toEqual({ a: { dir: "a" }, b: { dir: "b" } })
  })

  it("patch subcontexts overrides base subcontexts", () => {
    const base = { subcontexts: { dir: "features", doctypes: ["a"] } }
    const patch = { doctypes: {}, subcontexts: { dir: "sprints", doctypes: ["b"] } }
    const result = mergeConfigs(base, patch)
    expect(result.subcontexts).toEqual({ dir: "sprints", doctypes: ["b"] })
  })

  it("keeps base subcontexts when patch has none", () => {
    const base = { subcontexts: { dir: "features", doctypes: ["a"] } }
    const patch = { doctypes: { b: { dir: "b" } } }
    const result = mergeConfigs(base, patch)
    expect(result.subcontexts).toEqual({ dir: "features", doctypes: ["a"] })
  })
})

describe("configToJson", () => {
  it("always includes $schema", () => {
    const json = configToJson({})
    const parsed = JSON.parse(json)
    expect(parsed.$schema).toBe(SCHEMA_URL)
  })

  it("omits doctypes key when empty", () => {
    const json = configToJson({})
    const parsed = JSON.parse(json)
    expect(parsed.doctypes).toBeUndefined()
  })

  it("omits default sequenceScheme (000)", () => {
    const json = configToJson({ doctypes: { notes: { dir: "notes", sequenceScheme: "000" } } })
    const parsed = JSON.parse(json)
    expect(parsed.doctypes.notes.sequenceScheme).toBeUndefined()
  })

  it("omits default sequenceSeparator (.)", () => {
    const json = configToJson({ doctypes: { notes: { dir: "notes", sequenceSeparator: "." } } })
    const parsed = JSON.parse(json)
    expect(parsed.doctypes.notes.sequenceSeparator).toBeUndefined()
  })

  it("preserves non-default sequenceScheme", () => {
    const json = configToJson({ doctypes: { notes: { dir: "notes", sequenceScheme: "datetime" } } })
    const parsed = JSON.parse(json)
    expect(parsed.doctypes.notes.sequenceScheme).toBe("datetime")
  })

  it("includes subcontexts when present", () => {
    const json = configToJson({ subcontexts: { dir: "features", doctypes: ["notes"] } })
    const parsed = JSON.parse(json)
    expect(parsed.subcontexts).toEqual({ dir: "features", doctypes: ["notes"] })
  })

  it("includes sync when non-empty", () => {
    const sync = [{ upstream: "other/path", local: "local/path", mode: "receive_merge" as const }]
    const json = configToJson({ sync })
    const parsed = JSON.parse(json)
    expect(parsed.sync).toEqual(sync)
  })

  it("omits sync when empty array", () => {
    const json = configToJson({ sync: [] })
    const parsed = JSON.parse(json)
    expect(parsed.sync).toBeUndefined()
  })
})

describe("runInit — template path", () => {
  beforeEach(() => {
    vi.mocked(p.select).mockResolvedValueOnce("template")
  })

  it("applies notes template and writes file", async () => {
    vi.mocked(p.select).mockResolvedValueOnce("notes")

    await runInit()

    expect(fs.writeFileSyncOrAbort).toHaveBeenCalledWith(
      join(tempDir, ".mcm.json"),
      expect.stringContaining('"notes"'),
    )
    expect(p.outro).toHaveBeenCalledWith("Created .mcm.json")
  })

  it("applies feature-project template with subcontexts and adr", async () => {
    vi.mocked(p.select).mockResolvedValueOnce("feature-project")

    await runInit()

    const [, content] = vi.mocked(fs.writeFileSyncOrAbort).mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.subcontexts).toBeDefined()
    expect(parsed.doctypes.adr).toBeDefined()
    expect(parsed.doctypes.specs).toBeDefined()
    expect(parsed.doctypes.tasks).toBeDefined()
  })
})

describe("runInit — custom path", () => {
  beforeEach(() => {
    vi.mocked(p.select).mockResolvedValueOnce("custom")
    vi.mocked(project.parseProject).mockReturnValue({
      extend: false,
      doctypes: {},
      sync: [],
    })
  })

  it("builds config from prompts and writes file", async () => {
    // subcontexts: no
    vi.mocked(p.confirm).mockResolvedValueOnce(false)
    // add a doctype: yes
    vi.mocked(p.confirm).mockResolvedValueOnce(true)
    // doctype name: notes
    vi.mocked(p.text).mockResolvedValueOnce("notes")
    // directory: notes (default)
    vi.mocked(p.text).mockResolvedValueOnce("notes")
    // sequence scheme: 000
    vi.mocked(p.select).mockResolvedValueOnce("000")
    // add another: no
    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    await runInit()

    const [, content] = vi.mocked(fs.writeFileSyncOrAbort).mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.doctypes.notes.dir).toBe("notes")
    expect(p.outro).toHaveBeenCalledWith("Created .mcm.json")
  })

  it("adds subcontext config when user enables subcontexts", async () => {
    // use subcontexts: yes
    vi.mocked(p.confirm).mockResolvedValueOnce(true)
    // subcontexts dir
    vi.mocked(p.text).mockResolvedValueOnce("features")
    // add a doctype: yes
    vi.mocked(p.confirm).mockResolvedValueOnce(true)
    // doctype name
    vi.mocked(p.text).mockResolvedValueOnce("notes")
    // managed by subcontexts: yes
    vi.mocked(p.confirm).mockResolvedValueOnce(true)
    // directory
    vi.mocked(p.text).mockResolvedValueOnce("notes")
    // scheme
    vi.mocked(p.select).mockResolvedValueOnce("000")
    // add another: no
    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    await runInit()

    const [, content] = vi.mocked(fs.writeFileSyncOrAbort).mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.subcontexts.dir).toBe("features")
    expect(parsed.subcontexts.doctypes).toContain("notes")
  })
})

describe("runInit — CWD conflict (existing .mcm.json)", () => {
  const existingRaw = {
    $schema: SCHEMA_URL,
    doctypes: { existing: { dir: "existing" } },
    sync: [{ upstream: "other/.mcm.json", local: ".mcm.json", mode: "receive_merge" }],
  }

  beforeEach(() => {
    writeProjectFile(existingRaw)
    vi.mocked(project.locateProjectFile).mockReturnValue(join(tempDir, ".mcm.json"))
    vi.mocked(project.loadJSONFile).mockReturnValue(existingRaw)
    vi.mocked(project.parseProject).mockReturnValue({
      extend: false,
      doctypes: { existing: { dir: "existing", sequenceScheme: "000", sequenceSeparator: "." } },
      sync: [{ upstream: "other/.mcm.json", local: ".mcm.json", mode: "receive_merge" }],
    })
  })

  it("cancel exits without writing", async () => {
    vi.mocked(p.select).mockResolvedValueOnce("cancel")
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit")
    })

    await expect(runInit()).rejects.toThrow("process.exit")
    expect(fs.writeFileSyncOrAbort).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it("overwrite proceeds fresh without merging", async () => {
    // select overwrite for existing config conflict
    vi.mocked(p.select).mockResolvedValueOnce("overwrite")
    // then template choice
    vi.mocked(p.select).mockResolvedValueOnce("template")
    // then template ID
    vi.mocked(p.select).mockResolvedValueOnce("notes")

    await runInit()

    const [, content] = vi.mocked(fs.writeFileSyncOrAbort).mock.calls[0]
    const parsed = JSON.parse(content as string)
    // Should NOT have the old "existing" doctype
    expect(parsed.doctypes?.existing).toBeUndefined()
    expect(parsed.doctypes?.notes).toBeDefined()
  })

  it("update merges new doctypes into existing config", async () => {
    // select update
    vi.mocked(p.select).mockResolvedValueOnce("update")
    // no subcontexts; add a doctype: yes
    vi.mocked(p.confirm).mockResolvedValueOnce(false)
    vi.mocked(p.confirm).mockResolvedValueOnce(true)
    // new doctype name
    vi.mocked(p.text).mockResolvedValueOnce("decisions")
    // dir
    vi.mocked(p.text).mockResolvedValueOnce("decisions")
    // scheme
    vi.mocked(p.select).mockResolvedValueOnce("000")
    // add another: no
    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    await runInit()

    const [, content] = vi.mocked(fs.writeFileSyncOrAbort).mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.doctypes.existing).toBeDefined()
    expect(parsed.doctypes.decisions).toBeDefined()
    expect(p.outro).toHaveBeenCalledWith("Updated .mcm.json")
  })

  it("update preserves sync and all other fields", async () => {
    // select update; no new doctypes
    vi.mocked(p.select).mockResolvedValueOnce("update")
    vi.mocked(p.confirm).mockResolvedValueOnce(false) // no subcontexts
    vi.mocked(p.confirm).mockResolvedValueOnce(false) // no add doctype

    await runInit()

    const [, content] = vi.mocked(fs.writeFileSyncOrAbort).mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.sync).toEqual(existingRaw.sync)
    expect(parsed.doctypes.existing).toBeDefined()
  })

  it("update rejects adding a doctype that already exists", async () => {
    // select update
    vi.mocked(p.select).mockResolvedValueOnce("update")
    vi.mocked(p.confirm).mockResolvedValueOnce(false) // no subcontexts
    vi.mocked(p.confirm).mockResolvedValueOnce(true) // add a doctype

    // Capture the validate function from p.text
    let validateFn: ((v: string) => string | undefined) | undefined
    vi.mocked(p.text).mockImplementationOnce(async (opts) => {
      validateFn = opts.validate as (v: string) => string | undefined
      return "decisions"
    })
    // dir
    vi.mocked(p.text).mockResolvedValueOnce("decisions")
    // scheme
    vi.mocked(p.select).mockResolvedValueOnce("000")
    // add another: no
    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    await runInit()

    // "existing" is already in the config — validate should reject it
    expect(validateFn?.("existing")).toMatch(/already exists/)
    // an unrelated new name is fine
    expect(validateFn?.("something-else")).toBeUndefined()
  })
})

describe("runInit — parent config warning", () => {
  it("confirm no exits without writing", async () => {
    vi.mocked(project.locateProjectFile).mockReturnValue("/parent/.mcm.json")
    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit")
    })

    await expect(runInit()).rejects.toThrow("process.exit")
    expect(fs.writeFileSyncOrAbort).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it("confirm yes proceeds to init flow", async () => {
    vi.mocked(project.locateProjectFile).mockReturnValue("/parent/.mcm.json")
    vi.mocked(p.confirm).mockResolvedValueOnce(true)
    vi.mocked(project.parseProject).mockReturnValue({ extend: false, doctypes: {}, sync: [] })
    // start choice: template
    vi.mocked(p.select).mockResolvedValueOnce("template")
    // template: notes
    vi.mocked(p.select).mockResolvedValueOnce("notes")

    await runInit()

    expect(fs.writeFileSyncOrAbort).toHaveBeenCalled()
  })
})
