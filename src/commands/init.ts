import { command } from "cleye"
import * as p from "@clack/prompts"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { writeFileSyncOrAbort } from "../lib/fs.js"
import { locateProjectFile, loadJSONFile, parseProject } from "../lib/project.js"
import { SCHEMA_URL } from "../lib/schema-url.js"
import type { RawConfig, RawDoctypeEntry, RawSubcontexts } from "../lib/raw-config.js"
import { getTemplates } from "../lib/templates.js"

export type { RawConfig, RawDoctypeEntry, RawSubcontexts }

export type SequenceScheme = "000" | "datetime" | "none"

export function buildDoctypeConfig(
  name: string,
  dir: string,
  scheme: SequenceScheme,
): RawDoctypeEntry {
  const entry: RawDoctypeEntry = { dir }
  if (scheme !== "000") {
    entry.sequenceScheme = scheme
  }
  return entry
}

export function mergeConfigs(base: RawConfig, patch: RawConfig): RawConfig {
  return {
    ...base,
    doctypes: { ...(base.doctypes ?? {}), ...(patch.doctypes ?? {}) },
    subcontexts: patch.subcontexts ?? base.subcontexts,
  }
}

export function configToJson(config: RawConfig): string {
  const output: Record<string, unknown> = {
    $schema: SCHEMA_URL,
  }

  if (config.doctypes && Object.keys(config.doctypes).length > 0) {
    const cleanDoctypes: Record<string, RawDoctypeEntry> = {}
    for (const [key, val] of Object.entries(config.doctypes)) {
      const clean: RawDoctypeEntry = { dir: val.dir }
      if (val.sequenceScheme && val.sequenceScheme !== "000") {
        clean.sequenceScheme = val.sequenceScheme
      }
      if (val.sequenceSeparator && val.sequenceSeparator !== ".") {
        clean.sequenceSeparator = val.sequenceSeparator
      }
      cleanDoctypes[key] = clean
    }
    output.doctypes = cleanDoctypes
  }

  if (config.sync && config.sync.length > 0) {
    output.sync = config.sync
  }

  if (config.subcontexts) {
    output.subcontexts = config.subcontexts
  }

  return JSON.stringify(output, null, 2)
}

// --- prompt helpers ---

function cancelAndExit(): never {
  p.cancel("Cancelled.")
  process.exit(0)
}

async function runTemplateFlow(configPath: string): Promise<void> {
  const templates = getTemplates()
  const templateId = await p.select({
    message: "Pick a template",
    options: templates.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
  })

  if (p.isCancel(templateId)) cancelAndExit()

  const template = templates.find((t) => t.id === templateId)!
  writeFileSyncOrAbort(configPath, configToJson(template.config))
  p.outro("Created .mcm.json")
}

export async function promptDoctype(
  subcontextsDir: string | undefined,
  existingNames?: Set<string>,
): Promise<{ name: string; entry: RawDoctypeEntry; managedBySubcontext: boolean }> {
  const name = await p.text({
    message: "Doctype name",
    validate: (value = "") => {
      if (!value.trim()) return "Name is required"
      if (!/^[A-Za-z0-9._-]+$/.test(value.trim())) {
        return "Only letters, digits, dots, hyphens, and underscores are allowed"
      }
      if (existingNames?.has(value.trim())) {
        return `Doctype "${value.trim()}" already exists`
      }
    },
  })

  if (p.isCancel(name)) cancelAndExit()

  const doctypeName = name.trim()

  let managedBySubcontext = false
  if (subcontextsDir) {
    const subManaged = await p.confirm({
      message: "Managed by subcontexts?",
      initialValue: false,
    })
    if (p.isCancel(subManaged)) cancelAndExit()
    managedBySubcontext = subManaged
  }

  if (managedBySubcontext) {
    p.log.info(`Directory is relative to each subcontext (e.g. \`${doctypeName}\`)`)
  } else {
    p.log.info(`Directory is relative to project root (e.g. \`context/${doctypeName}\`)`)
  }

  const dir = await p.text({
    message: "Directory",
    placeholder: doctypeName,
    initialValue: doctypeName,
  })

  if (p.isCancel(dir)) cancelAndExit()

  const dirValue = dir || doctypeName

  const scheme = await p.select<SequenceScheme>({
    message: "Sequence scheme",
    options: [
      { value: "000", label: "000 (numbered)", hint: "e.g. 001.my-note.md" },
      { value: "datetime", label: "datetime", hint: "e.g. 20240101120000.my-note.md" },
      { value: "none", label: "none", hint: "e.g. my-note.md" },
    ],
  })

  if (p.isCancel(scheme)) cancelAndExit()

  const resolvedPath = managedBySubcontext
    ? `${subcontextsDir}/★/${dirValue}/`
    : `${dirValue}/`
  p.log.info(`→ ${resolvedPath}`)

  return { name: doctypeName, entry: buildDoctypeConfig(doctypeName, dirValue, scheme), managedBySubcontext }
}

/**
 * Prompts the user to configure doctypes and subcontexts, then patches `baseJson` in place
 * and writes it to `configPath`. For a fresh config, pass `{ $schema: SCHEMA_URL }` as the
 * base. For an update, pass the existing raw JSON — all other fields are preserved unchanged.
 */
async function runCustomFlow(
  configPath: string,
  baseJson: Record<string, unknown>,
  existingDoctypes: Record<string, unknown>,
  existingSubcontexts: { dir: string; doctypes: string[] } | undefined,
  updateMode: boolean,
): Promise<void> {
  let subcontextsDir: string | undefined = existingSubcontexts?.dir

  if (!existingSubcontexts) {
    const useSubcontexts = await p.confirm({
      message: "Use subcontexts?",
      initialValue: false,
    })
    if (p.isCancel(useSubcontexts)) cancelAndExit()

    if (useSubcontexts) {
      const subDir = await p.text({
        message: "Subcontexts directory",
        placeholder: "features",
        initialValue: "features",
      })
      if (p.isCancel(subDir)) cancelAndExit()
      subcontextsDir = subDir || "features"
    }
  }

  const existingNames = new Set(Object.keys(existingDoctypes))
  const newDoctypes: Record<string, RawDoctypeEntry> = {}
  const subcontextManagedDoctypes: string[] = []

  let addDoctype = await p.confirm({ message: "Add a doctype?", initialValue: true })
  if (p.isCancel(addDoctype)) cancelAndExit()

  while (addDoctype) {
    const { name, entry, managedBySubcontext } = await promptDoctype(subcontextsDir, existingNames)
    newDoctypes[name] = entry
    existingNames.add(name)
    if (managedBySubcontext) subcontextManagedDoctypes.push(name)

    const another = await p.confirm({ message: "Add another doctype?", initialValue: false })
    if (p.isCancel(another)) cancelAndExit()
    addDoctype = another
  }

  // Patch only what changed; everything else in baseJson is preserved as-is.
  if (Object.keys(newDoctypes).length > 0) {
    baseJson.doctypes = { ...existingDoctypes, ...newDoctypes }
  }

  if (subcontextsDir && subcontextManagedDoctypes.length > 0) {
    const existingManaged = existingSubcontexts?.doctypes ?? []
    baseJson.subcontexts = {
      dir: subcontextsDir,
      doctypes: [...existingManaged, ...subcontextManagedDoctypes],
    }
  }

  writeFileSyncOrAbort(configPath, JSON.stringify(baseJson, null, 2))
  p.outro(updateMode ? "Updated .mcm.json" : "Created .mcm.json")
}

// --- main entry point ---

export async function runInit(): Promise<void> {
  const cwd = process.cwd()
  const configPath = join(cwd, ".mcm.json")

  let updateMode = false
  let baseJson: Record<string, unknown> = { $schema: SCHEMA_URL }

  if (existsSync(configPath)) {
    const choice = await p.select({
      message: ".mcm.json already exists here. What do you want to do?",
      options: [
        { value: "cancel", label: "Cancel" },
        { value: "overwrite", label: "Overwrite", hint: "Start fresh" },
        { value: "update", label: "Update", hint: "Add new doctypes to existing config" },
      ],
    })

    if (p.isCancel(choice) || choice === "cancel") cancelAndExit()

    if (choice === "update") {
      updateMode = true
      try {
        baseJson = loadJSONFile(configPath) as Record<string, unknown>
      } catch {
        baseJson = { $schema: SCHEMA_URL }
      }
    }
  } else {
    const parentConfig = locateProjectFile(resolve(cwd, ".."))
    if (parentConfig) {
      const confirmed = await p.confirm({
        message: `A config already exists at ${parentConfig}. Create a nested config here?`,
      })
      if (p.isCancel(confirmed) || !confirmed) cancelAndExit()
    }
  }

  p.intro("Initialize MCM project")

  if (!updateMode) {
    const startChoice = await p.select({
      message: "How do you want to start?",
      options: [
        { value: "template", label: "From a template" },
        { value: "custom", label: "Custom setup" },
      ],
    })

    if (p.isCancel(startChoice)) cancelAndExit()

    if (startChoice === "template") {
      await runTemplateFlow(configPath)
      return
    }
  }

  // Extract existing doctypes/subcontexts from baseJson for conflict detection and subcontext merging.
  // We parse through Zod to get normalized values; fall back to empty on error.
  let existingDoctypes: Record<string, unknown> = {}
  let existingSubcontexts: { dir: string; doctypes: string[] } | undefined
  try {
    const parsed = parseProject(baseJson)
    existingDoctypes = parsed.doctypes as unknown as Record<string, unknown>
    existingSubcontexts = parsed.subcontexts
  } catch {
    // leave defaults
  }

  await runCustomFlow(configPath, baseJson, existingDoctypes, existingSubcontexts, updateMode)
}

export const initCommand = command(
  {
    name: "init",
    help: { description: "Initialize a new MCM project" },
  },
  async () => {
    await runInit()
  },
)
