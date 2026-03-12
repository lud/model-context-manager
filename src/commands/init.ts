import { command } from "cleye"
import * as p from "@clack/prompts"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { RawConfig, RawDoctypeEntry } from "../lib/raw-config.js"
import { SCHEMA_URL } from "../lib/schema-url.js"
import { locateProjectFile, ProjectSchema } from "../lib/project.js"
import { readFileSyncOrAbort, writeFileSyncOrAbort } from "../lib/fs.js"

const CONFIG_FILE = ".mcm.json"

export function serializeConfig(config: RawConfig): string {
  const out: Record<string, unknown> = { $schema: SCHEMA_URL }

  if (config.subcontextDoctype) {
    out.subcontextDoctype = config.subcontextDoctype
  }

  if (config.managedDoctypes && config.managedDoctypes.length > 0) {
    out.managedDoctypes = config.managedDoctypes
  }

  if (config.doctypes && Object.keys(config.doctypes).length > 0) {
    out.doctypes = config.doctypes
  }

  if (config.sync && Array.isArray(config.sync) && config.sync.length > 0) {
    out.sync = config.sync
  }

  return JSON.stringify(out, null, 2) + "\n"
}

export async function resolveConflict(
  cwd: string,
): Promise<{ mode: "update" | "overwrite" | "fresh"; base: RawConfig }> {
  const localPath = join(cwd, CONFIG_FILE)

  if (existsSync(localPath)) {
    const action = await p.select({
      message: `${CONFIG_FILE} already exists. What would you like to do?`,
      options: [
        { value: "update", label: "Update existing config" },
        { value: "overwrite", label: "Overwrite with new config" },
        { value: "cancel", label: "Cancel" },
      ],
      initialValue: "update" as string,
    })

    if (p.isCancel(action) || action === "cancel") {
      p.cancel("Init cancelled.")
      process.exit(0)
    }

    if (action === "overwrite") {
      return { mode: "overwrite", base: {} }
    }

    // update mode — try to parse existing
    let parsed: RawConfig
    try {
      const content = readFileSyncOrAbort(localPath, "utf-8")
      parsed = JSON.parse(content) as RawConfig
    } catch {
      p.log.warning("Could not parse existing config file.")
      const overwrite = await p.confirm({
        message: "Overwrite with a new config?",
      })
      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel("Init cancelled.")
        process.exit(0)
      }
      return { mode: "overwrite", base: {} }
    }

    return { mode: "update", base: parsed }
  }

  // No local file — check for parent
  const parentPath = locateProjectFile(cwd)
  if (parentPath) {
    p.log.warning(`Found parent config at ${parentPath}`)
    const proceed = await p.confirm({
      message: "Create a local config file anyway?",
    })
    if (p.isCancel(proceed) || !proceed) {
      p.cancel("Init cancelled.")
      process.exit(0)
    }
  }

  return { mode: "fresh", base: {} }
}

function validateCandidate(candidate: RawConfig): string | undefined {
  const result = ProjectSchema.safeParse(candidate)
  if (result.success) return undefined
  return result.error.issues[0].message
}

export async function promptDoctype(
  config: RawConfig,
): Promise<{ name: string; entry: RawDoctypeEntry; role: "regular" | "subcontext" | "managed" } | null> {
  const addMore = await p.confirm({
    message: "Add a doctype?",
  })
  if (p.isCancel(addMore) || !addMore) return null

  const existingNames = new Set(Object.keys(config.doctypes ?? {}))

  const name = await p.text({
    message: "Doctype name:",
    validate(value = "") {
      if (existingNames.has(value)) {
        return `Doctype "${value}" already exists`
      }
      // Validate name through the project schema with a temporary
      // unique dir to avoid false duplicate-directory errors
      const placeholderDir = `__placeholder_${Math.random()}`
      const candidate: RawConfig = {
        ...config,
        doctypes: { ...config.doctypes, [value]: { dir: placeholderDir } },
      }
      return validateCandidate(candidate)
    },
  })
  if (p.isCancel(name)) {
    p.cancel("Init cancelled.")
    process.exit(0)
  }

  let role: "regular" | "subcontext" | "managed" = "regular"

  if (!config.subcontextDoctype) {
    const isSubcontext = await p.confirm({
      message: "Should this be the subcontext doctype?",
      initialValue: false,
    })
    if (p.isCancel(isSubcontext)) {
      p.cancel("Init cancelled.")
      process.exit(0)
    }
    if (isSubcontext) role = "subcontext"
  } else {
    const isManaged = await p.confirm({
      message: "Should this be a managed doctype?",
      initialValue: false,
    })
    if (p.isCancel(isManaged)) {
      p.cancel("Init cancelled.")
      process.exit(0)
    }
    if (isManaged) role = "managed"
  }

  const dirMessage =
    role === "subcontext"
      ? "Directory for subcontext containers:"
      : role === "managed"
        ? "Directory inside each subcontext (relative to subcontext dir):"
        : "Directory for files:"

  const dir = await p.text({
    message: dirMessage,
    defaultValue: name,
    placeholder: name,
    validate(value = "") {
      const dirValue = value || name
      const candidate: RawConfig = {
        ...config,
        doctypes: { ...config.doctypes, [name]: { dir: dirValue } },
      }
      return validateCandidate(candidate)
    },
  })
  if (p.isCancel(dir)) {
    p.cancel("Init cancelled.")
    process.exit(0)
  }

  return { name, entry: { dir: dir || name }, role }
}

export const initCommand = command(
  {
    name: "init",
    help: { description: "Initialize or update an .mcm.json config file" },
  },
  async () => {
    const cwd = process.cwd()

    p.intro("mcm init")

    const { base } = await resolveConflict(cwd)

    const config: RawConfig = { ...base }
    if (!config.doctypes) config.doctypes = {}
    if (!config.managedDoctypes) config.managedDoctypes = []

    for (;;) {
      const result = await promptDoctype(config)
      if (!result) break

      config.doctypes[result.name] = result.entry

      if (result.role === "subcontext") {
        config.subcontextDoctype = result.name
      } else if (result.role === "managed") {
        const existing: string[] = config.managedDoctypes ?? []
        config.managedDoctypes = [...existing, result.name]
      }
    }

    const output = serializeConfig(config)
    const outPath = join(cwd, CONFIG_FILE)
    writeFileSyncOrAbort(outPath, output)

    p.outro(`Wrote ${CONFIG_FILE}`)
  },
)
