import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as p from "@clack/prompts"
import {
  serializeConfig,
  resolveConflict,
  promptDoctype,
  initCommand,
} from "./init.js"
import type { RawConfig } from "../lib/raw-config.js"
import { SCHEMA_URL } from "../lib/schema-url.js"

vi.mock("@clack/prompts")
vi.mock("../lib/fs.js")
vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, existsSync: vi.fn(() => false) }
})

// Grab mocked modules
import { existsSync } from "node:fs"
import { readFileSyncOrAbort, writeFileSyncOrAbort } from "../lib/fs.js"

// locateProjectFile is used by resolveConflict — mock it directly
vi.mock("../lib/project.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, locateProjectFile: vi.fn(() => null) }
})
import { locateProjectFile } from "../lib/project.js"

beforeEach(() => {
  vi.mocked(p.isCancel).mockReturnValue(false)
  vi.mocked(p.cancel).mockImplementation(() => {})
  vi.mocked(p.intro).mockImplementation(() => {})
  vi.mocked(p.outro).mockImplementation(() => {})
  vi.mocked(p.log).warning = vi.fn()
  vi.mocked(p.log).step = vi.fn()
})

afterEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// serializeConfig
// ---------------------------------------------------------------------------

describe("serializeConfig", () => {
  it("always includes $schema", () => {
    const result = serializeConfig({})
    const parsed = JSON.parse(result)
    expect(parsed.$schema).toBe(SCHEMA_URL)
  })

  it("omits empty doctypes", () => {
    const result = serializeConfig({ doctypes: {} })
    const parsed = JSON.parse(result)
    expect(parsed.doctypes).toBeUndefined()
  })

  it("omits empty managedDoctypes", () => {
    const result = serializeConfig({ managedDoctypes: [] })
    const parsed = JSON.parse(result)
    expect(parsed.managedDoctypes).toBeUndefined()
  })

  it("omits empty sync", () => {
    const result = serializeConfig({ sync: [] })
    const parsed = JSON.parse(result)
    expect(parsed.sync).toBeUndefined()
  })

  it("preserves sync when present", () => {
    const config: RawConfig = {
      sync: [{ upstream: "/some/path", local: "dest", mode: "receive_merge" }] as unknown[],
    }
    const result = serializeConfig(config)
    const parsed = JSON.parse(result)
    expect(parsed.sync).toHaveLength(1)
  })

  it("includes subcontextDoctype when set", () => {
    const result = serializeConfig({ subcontextDoctype: "projects" })
    const parsed = JSON.parse(result)
    expect(parsed.subcontextDoctype).toBe("projects")
  })

  it("includes doctypes when non-empty", () => {
    const result = serializeConfig({
      doctypes: { notes: { dir: "notes" } },
    })
    const parsed = JSON.parse(result)
    expect(parsed.doctypes.notes).toEqual({ dir: "notes" })
  })

  it("ends with newline", () => {
    expect(serializeConfig({})).toMatch(/\n$/)
  })
})

// ---------------------------------------------------------------------------
// resolveConflict
// ---------------------------------------------------------------------------

describe("resolveConflict", () => {
  it("returns fresh when no local or parent config exists", async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(locateProjectFile).mockReturnValue(null)

    const result = await resolveConflict("/tmp/test")
    expect(result).toEqual({ mode: "fresh", base: {} })
  })

  it("returns update with parsed base when user chooses update", async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(p.select).mockResolvedValue("update")
    vi.mocked(readFileSyncOrAbort).mockReturnValue(
      JSON.stringify({ doctypes: { notes: { dir: "notes" } } }),
    )

    const result = await resolveConflict("/tmp/test")
    expect(result.mode).toBe("update")
    expect(result.base.doctypes).toEqual({ notes: { dir: "notes" } })
  })

  it("returns overwrite with empty base when user chooses overwrite", async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(p.select).mockResolvedValue("overwrite")

    const result = await resolveConflict("/tmp/test")
    expect(result).toEqual({ mode: "overwrite", base: {} })
  })

  it("exits on cancel selection", async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(p.select).mockResolvedValue("cancel")

    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
    await expect(resolveConflict("/tmp/test")).rejects.toThrow("exit")
    expect(exit).toHaveBeenCalledWith(0)
    exit.mockRestore()
  })

  it("exits on p.isCancel from select", async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(p.select).mockResolvedValue(Symbol("cancel"))
    vi.mocked(p.isCancel).mockReturnValue(true)

    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
    await expect(resolveConflict("/tmp/test")).rejects.toThrow("exit")
    exit.mockRestore()
  })

  it("warns and offers overwrite when JSON parse fails in update mode", async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(p.select).mockResolvedValue("update")
    vi.mocked(readFileSyncOrAbort).mockReturnValue("not valid json{{{")
    vi.mocked(p.confirm).mockResolvedValue(true)

    const result = await resolveConflict("/tmp/test")
    expect(p.log.warning).toHaveBeenCalled()
    expect(result).toEqual({ mode: "overwrite", base: {} })
  })

  it("warns about parent config and proceeds on confirm", async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(locateProjectFile).mockReturnValue("/parent/.mcm.json")
    vi.mocked(p.confirm).mockResolvedValue(true)

    const result = await resolveConflict("/tmp/test")
    expect(p.log.warning).toHaveBeenCalledWith(
      expect.stringContaining("/parent/.mcm.json"),
    )
    expect(result).toEqual({ mode: "fresh", base: {} })
  })

  it("exits when user declines to create local with parent present", async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(locateProjectFile).mockReturnValue("/parent/.mcm.json")
    vi.mocked(p.confirm).mockResolvedValue(false)

    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
    await expect(resolveConflict("/tmp/test")).rejects.toThrow("exit")
    exit.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// promptDoctype
// ---------------------------------------------------------------------------

describe("promptDoctype", () => {
  it("returns null when user declines to add", async () => {
    vi.mocked(p.confirm).mockResolvedValue(false)
    const result = await promptDoctype({})
    expect(result).toBeNull()
  })

  it("prompts for regular doctype when no subcontext exists and user declines subcontext", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(false)  // subcontext?
    vi.mocked(p.text)
      .mockResolvedValueOnce("notes")  // name
      .mockResolvedValueOnce("notes")  // dir
    const result = await promptDoctype({})
    expect(result).toEqual({
      name: "notes",
      entry: { dir: "notes" },
      role: "regular",
    })
  })

  it("prompts for subcontext doctype when none exists and user confirms", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)  // add doctype?
      .mockResolvedValueOnce(true)  // subcontext?
    vi.mocked(p.text)
      .mockResolvedValueOnce("projects")  // name
      .mockResolvedValueOnce("projects")  // dir

    const result = await promptDoctype({})
    expect(result).toEqual({
      name: "projects",
      entry: { dir: "projects" },
      role: "subcontext",
    })
  })

  it("prompts for managed doctype when subcontext exists and user confirms", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)  // add doctype?
      .mockResolvedValueOnce(true)  // managed?
    vi.mocked(p.text)
      .mockResolvedValueOnce("tasks")  // name
      .mockResolvedValueOnce("tasks")  // dir

    const result = await promptDoctype({ subcontextDoctype: "projects" })
    expect(result).toEqual({
      name: "tasks",
      entry: { dir: "tasks" },
      role: "managed",
    })
  })

  it("uses dir default when user provides empty dir", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(false)  // subcontext?
    vi.mocked(p.text)
      .mockResolvedValueOnce("notes")  // name
      .mockResolvedValueOnce("")       // dir (empty → default)

    const result = await promptDoctype({})
    expect(result!.entry.dir).toBe("notes")
  })

  it("exits on cancel during name prompt", async () => {
    vi.mocked(p.confirm).mockResolvedValueOnce(true)
    vi.mocked(p.text).mockResolvedValueOnce(Symbol("cancel") as never)
    vi.mocked(p.isCancel).mockImplementation((value) => typeof value === "symbol")

    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
    await expect(promptDoctype({})).rejects.toThrow("exit")
    exit.mockRestore()
  })

  it("exits on cancel during role prompt", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(Symbol("cancel") as never)
    vi.mocked(p.text).mockResolvedValueOnce("notes")
    vi.mocked(p.isCancel).mockImplementation((value) => typeof value === "symbol")

    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
    await expect(promptDoctype({})).rejects.toThrow("exit")
    exit.mockRestore()
  })

  it("exits on cancel during dir prompt", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(false)  // subcontext?
    vi.mocked(p.text)
      .mockResolvedValueOnce("notes")
      .mockResolvedValueOnce(Symbol("cancel") as never)
    vi.mocked(p.isCancel).mockImplementation((value) => typeof value === "symbol")

    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
    await expect(promptDoctype({})).rejects.toThrow("exit")
    exit.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Name validation (via ProjectSchema)
// ---------------------------------------------------------------------------

describe("name validation", () => {
  it("validate callback rejects invalid chars via schema", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    vi.mocked(p.text)
      .mockResolvedValueOnce("notes")
      .mockResolvedValueOnce("notes")

    await promptDoctype({})

    const validate = vi.mocked(p.text).mock.calls[0][0].validate!
    expect(validate("valid-name")).toBeUndefined()
    expect(validate("with spaces")).toBeDefined()
    expect(validate("with/slash")).toBeDefined()
  })

  it("validate callback rejects 'sub' via schema", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    vi.mocked(p.text)
      .mockResolvedValueOnce("notes")
      .mockResolvedValueOnce("notes")

    await promptDoctype({})

    const validate = vi.mocked(p.text).mock.calls[0][0].validate!
    expect(validate("sub")).toBeDefined()
    expect(validate("sub")).toContain("reserved")
  })

  it("validate callback rejects duplicate name", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    vi.mocked(p.text)
      .mockResolvedValueOnce("tasks")
      .mockResolvedValueOnce("tasks")

    await promptDoctype({ doctypes: { notes: { dir: "notes" } } })

    const validate = vi.mocked(p.text).mock.calls[0][0].validate!
    expect(validate("notes")).toContain("already exists")
  })

  it("accepts a name that matches an existing doctype's directory", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    vi.mocked(p.text)
      .mockResolvedValueOnce("bar")
      .mockResolvedValueOnce("bar-files")

    // "foo" has dir "bar" — adding doctype named "bar" should be allowed
    await promptDoctype({ doctypes: { foo: { dir: "bar" } } })

    const validate = vi.mocked(p.text).mock.calls[0][0].validate!
    expect(validate("bar")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Dir validation (duplicate directory)
// ---------------------------------------------------------------------------

describe("dir validation", () => {
  it("validate callback rejects duplicate directory via schema", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(false)  // subcontext?
    vi.mocked(p.text)
      .mockResolvedValueOnce("tasks")   // name
      .mockResolvedValueOnce("tasks")   // dir (accepted value, but we test validate)

    await promptDoctype({ doctypes: { notes: { dir: "shared" } } })

    // The dir validate is on the second p.text call
    const dirValidate = vi.mocked(p.text).mock.calls[1][0].validate!
    expect(dirValidate("shared")).toBeDefined()
    expect(dirValidate("shared")).toContain("duplicate")
  })

  it("validate callback accepts unique directory", async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    vi.mocked(p.text)
      .mockResolvedValueOnce("tasks")
      .mockResolvedValueOnce("tasks")

    await promptDoctype({ doctypes: { notes: { dir: "notes" } } })

    const dirValidate = vi.mocked(p.text).mock.calls[1][0].validate!
    expect(dirValidate("tasks")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Subcontext prompting logic
// ---------------------------------------------------------------------------

describe("subcontext prompting", () => {
  it('asks "be subcontext?" when no subcontext exists', async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(false)  // subcontext?
    vi.mocked(p.text)
      .mockResolvedValueOnce("notes")
      .mockResolvedValueOnce("notes")

    await promptDoctype({})

    const confirmCalls = vi.mocked(p.confirm).mock.calls
    expect(confirmCalls[1][0].message).toContain("subcontext")
  })

  it('asks "be managed?" when subcontext exists', async () => {
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(false)  // managed?
    vi.mocked(p.text)
      .mockResolvedValueOnce("tasks")
      .mockResolvedValueOnce("tasks")

    await promptDoctype({ subcontextDoctype: "projects" })

    const confirmCalls = vi.mocked(p.confirm).mock.calls
    expect(confirmCalls[1][0].message).toContain("managed")
  })
})

// ---------------------------------------------------------------------------
// initCommand integration
// ---------------------------------------------------------------------------

describe("initCommand", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  it("writes minimal config with zero doctypes", async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(locateProjectFile).mockReturnValue(null)
    // decline to add any doctypes
    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    await initCommand.callback!({ _: {} } as never)

    expect(writeFileSyncOrAbort).toHaveBeenCalledTimes(1)
    const written = vi.mocked(writeFileSyncOrAbort).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.$schema).toBe(SCHEMA_URL)
    expect(parsed.doctypes).toBeUndefined()
  })

  it("writes config with a regular doctype", async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(locateProjectFile).mockReturnValue(null)
    // add one doctype then stop
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(false)  // subcontext?
      .mockResolvedValueOnce(false)  // add another?
    vi.mocked(p.text)
      .mockResolvedValueOnce("notes")  // name
      .mockResolvedValueOnce("notes")  // dir

    await initCommand.callback!({ _: {} } as never)

    const written = vi.mocked(writeFileSyncOrAbort).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.doctypes.notes).toEqual({ dir: "notes" })
    expect(parsed.subcontextDoctype).toBeUndefined()
    expect(parsed.managedDoctypes).toBeUndefined()
  })

  it("writes config with subcontext + managed doctype", async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(locateProjectFile).mockReturnValue(null)
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(true)   // subcontext?
      .mockResolvedValueOnce(true)   // add another doctype?
      .mockResolvedValueOnce(true)   // managed?
      .mockResolvedValueOnce(false)  // add another?
    vi.mocked(p.text)
      .mockResolvedValueOnce("projects")   // name
      .mockResolvedValueOnce("projects")   // dir
      .mockResolvedValueOnce("tasks")      // name
      .mockResolvedValueOnce("tasks")      // dir

    await initCommand.callback!({ _: {} } as never)

    const written = vi.mocked(writeFileSyncOrAbort).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.subcontextDoctype).toBe("projects")
    expect(parsed.managedDoctypes).toEqual(["tasks"])
    expect(parsed.doctypes.projects).toEqual({ dir: "projects" })
    expect(parsed.doctypes.tasks).toEqual({ dir: "tasks" })
  })

  it("patch mode preserves existing doctypes and sync", async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(p.select).mockResolvedValue("update")
    vi.mocked(readFileSyncOrAbort).mockReturnValue(
      JSON.stringify({
        doctypes: { notes: { dir: "notes" } },
        sync: [{ upstream: "/foo", local: "bar" }],
      }),
    )
    // decline to add any new doctypes
    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    await initCommand.callback!({ _: {} } as never)

    const written = vi.mocked(writeFileSyncOrAbort).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.doctypes.notes).toEqual({ dir: "notes" })
    expect(parsed.sync).toHaveLength(1)
  })

  it("patch mode preserves existing subcontextDoctype", async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(p.select).mockResolvedValue("update")
    vi.mocked(readFileSyncOrAbort).mockReturnValue(
      JSON.stringify({
        subcontextDoctype: "projects",
        doctypes: { projects: { dir: "projects" } },
      }),
    )
    // add a managed doctype then stop
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true)   // add doctype?
      .mockResolvedValueOnce(true)   // managed?
      .mockResolvedValueOnce(false)  // add another?
    vi.mocked(p.text)
      .mockResolvedValueOnce("tasks")
      .mockResolvedValueOnce("tasks")

    await initCommand.callback!({ _: {} } as never)

    const written = vi.mocked(writeFileSyncOrAbort).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.subcontextDoctype).toBe("projects")
    expect(parsed.managedDoctypes).toEqual(["tasks"])
    expect(parsed.doctypes.projects).toEqual({ dir: "projects" })
    expect(parsed.doctypes.tasks).toEqual({ dir: "tasks" })
  })
})
