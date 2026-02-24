import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"
import {
  loadConfigOrFail,
  getConfig,
  locateConfigFile,
  parseConfig,
} from "./config.js"
import { join, resolve } from "node:path"
import { mkdtempSync, mkdirSync, chmodSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import * as cli from "./cli.js"

vi.mock("./cli.js")

const fixtures = join(
  import.meta.dirname,
  "../../test/fixtures",
  "config-lookup",
)

describe("parseConfig", () => {
  it("returns default config for empty object", () => {
    expect(parseConfig({})).toEqual({ extend: false, doctypes: {} })
  })

  it("respects extend: true when provided", () => {
    expect(parseConfig({ extend: true })).toEqual({
      extend: true,
      doctypes: {},
    })
  })

  it("throws ZodError when extend is wrong type", () => {
    expect(() => parseConfig({ extend: "yes" })).toThrow(ZodError)
  })

  it("throws ZodError when passed null", () => {
    expect(() => parseConfig(null)).toThrow(ZodError)
  })

  it("throws ZodError when passed a non-object", () => {
    expect(() => parseConfig(42)).toThrow(ZodError)
  })

  it("strips unknown fields from output", () => {
    expect(parseConfig({ extend: false, unknown: "field" })).toEqual({
      extend: false,
      doctypes: {},
    })
  })

  it("strips $schema property from output", () => {
    expect(
      parseConfig({ $schema: "./resources/mcm-config.schema.json" }),
    ).toEqual({
      extend: false,
      doctypes: {},
    })
  })

  it("accepts a valid doctype entry", () => {
    const result = parseConfig({ doctypes: { notes: { dir: "/some/path" } } })
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
      parseConfig({ doctypes: { "my notes": { dir: "/path" } } }),
    ).toThrow(ZodError)
  })

  it("throws ZodError for doctype key with invalid character (!)", () => {
    expect(() =>
      parseConfig({ doctypes: { "bad!key": { dir: "/path" } } }),
    ).toThrow(ZodError)
  })

  it("throws ZodError when doctype value is missing dir", () => {
    expect(() => parseConfig({ doctypes: { notes: {} } })).toThrow(ZodError)
  })

  it("throws ZodError when doctype dir is wrong type", () => {
    expect(() => parseConfig({ doctypes: { notes: { dir: 42 } } })).toThrow(
      ZodError,
    )
  })

  it("strips unknown fields inside doctype value", () => {
    const result = parseConfig({
      doctypes: { notes: { dir: "/path", extra: "ignored" } },
    })
    expect(result.doctypes.notes).toEqual({
      dir: "/path",
      sequenceScheme: "000",
      sequenceSeparator: ".",
    })
  })

  it("applies default sequenceScheme and sequenceSeparator when omitted", () => {
    const result = parseConfig({ doctypes: { notes: { dir: "/path" } } })
    expect(result.doctypes.notes.sequenceScheme).toBe("000")
    expect(result.doctypes.notes.sequenceSeparator).toBe(".")
  })

  it("accepts sequenceScheme: 'none'", () => {
    const result = parseConfig({
      doctypes: { notes: { dir: "/path", sequenceScheme: "none" } },
    })
    expect(result.doctypes.notes.sequenceScheme).toBe("none")
  })

  it("accepts sequenceScheme: 'datetime'", () => {
    const result = parseConfig({
      doctypes: { notes: { dir: "/path", sequenceScheme: "datetime" } },
    })
    expect(result.doctypes.notes.sequenceScheme).toBe("datetime")
  })

  it("accepts zero-padded sequenceScheme strings", () => {
    for (const scheme of ["0", "00", "0000"]) {
      const result = parseConfig({
        doctypes: { notes: { dir: "/path", sequenceScheme: scheme } },
      })
      expect(result.doctypes.notes.sequenceScheme).toBe(scheme)
    }
  })

  it("rejects invalid sequenceScheme values", () => {
    for (const scheme of ["abc", "123", "", "00x"]) {
      expect(() =>
        parseConfig({
          doctypes: { notes: { dir: "/path", sequenceScheme: scheme } },
        }),
      ).toThrow(ZodError)
    }
  })

  it("accepts custom sequenceSeparator values", () => {
    for (const sep of ["-", "_", " - "]) {
      const result = parseConfig({
        doctypes: { notes: { dir: "/path", sequenceSeparator: sep } },
      })
      expect(result.doctypes.notes.sequenceSeparator).toBe(sep)
    }
  })

  it("rejects invalid sequenceSeparator values", () => {
    for (const sep of ["", "/"]) {
      expect(() =>
        parseConfig({
          doctypes: { notes: { dir: "/path", sequenceSeparator: sep } },
        }),
      ).toThrow(ZodError)
    }
  })
})

describe("locateConfigFile", () => {
  it("finds .mcm.json in cwd", () => {
    const start = join(fixtures, "with-config")
    console.log(`start`, start)
    expect(locateConfigFile(start)).toBe(join(start, ".mcm.json"))
  })

  it("finds .mcm.json in ancestor directory", () => {
    const start = join(fixtures, "with-config", "nested", "deeply")
    expect(locateConfigFile(start)).toBe(
      join(fixtures, "with-config", ".mcm.json"),
    )
  })

  it("returns null when no config exists", () => {
    const start = join(fixtures, "without-config", "nested", "deeply")
    expect(locateConfigFile(start)).toBeNull()
  })

  const isRoot = process.getuid?.() === 0
  const tmp = !isRoot ? mkdtempSync(join(tmpdir(), "mcm-test-")) : null

  afterAll(() => {
    if (tmp) {
      chmodSync(join(tmp, "no-access"), 0o755)
      rmSync(tmp, { recursive: true })
    }
  })

  it.skipIf(isRoot)("returns null on permission error", () => {
    const noAccess = join(tmp!, "no-access")
    const child = join(noAccess, "child")
    mkdirSync(child, { recursive: true })
    chmodSync(noAccess, 0o000)

    expect(locateConfigFile(child)).toBeNull()
  })
})

describe("loadConfigOrFail", () => {
  const docFixtures = join(import.meta.dirname, "../../test/fixtures/doctypes")

  it("resolves relative dir relative to config file directory", () => {
    const config = loadConfigOrFail(
      join(docFixtures, "relative-dir", ".mcm.json"),
    )
    expect(config.doctypes.notes.dir).toBe(
      join(docFixtures, "relative-dir", "my-docs"),
    )
  })

  it("keeps absolute dir unchanged", () => {
    const config = loadConfigOrFail(
      join(docFixtures, "absolute-dir", ".mcm.json"),
    )
    expect(config.doctypes.notes.dir).toBe("/absolute/path")
  })

  it("returns empty doctypes when none configured", () => {
    const config = loadConfigOrFail(
      join(docFixtures, "no-doctypes", ".mcm.json"),
    )
    expect(config.doctypes).toEqual({})
  })

  it("includes configFile and configDir in returned object", () => {
    const filePath = join(docFixtures, "relative-dir", ".mcm.json")
    const config = loadConfigOrFail(filePath)
    expect(config.configFile).toBe(resolve(filePath))
    expect(config.configDir).toBe(resolve(join(docFixtures, "relative-dir")))
  })
})

describe("getConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("aborts when no config file is found", () => {
    vi.mocked(cli.abortError).mockImplementation(() => {
      throw new Error("abortError")
    })
    vi.spyOn(process, "cwd").mockReturnValue(
      join(fixtures, "without-config", "nested", "deeply"),
    )

    expect(() => getConfig()).toThrow("abortError")
    expect(cli.abortError).toHaveBeenCalledWith(
      "Could not find .mcm.json configuration file",
    )
  })
})
