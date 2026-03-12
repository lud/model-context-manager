import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { z } from "zod"
import { abortError } from "./cli.js"
import { getCurrentSubcontext } from "./global-config.js"
import {
  listBriefFiles,
  listSubcontexts,
  resolveSubcontextArg,
} from "./subcontext.js"

export const DoctypeKeySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "Only letters, digits, dots, hyphens, and underscores are allowed",
  )
  .describe(
    "Doctype name. Only letters, digits, dots, hyphens, and underscores are allowed.",
  )

const SequenceSchemeSchema = z
  .union([z.enum(["none", "datetime"]), z.string().regex(/^0+$/)])
  .default("000")
  .describe(
    "How filenames are sequenced. " +
      '"none" disables sequencing. ' +
      '"datetime" uses a YYYYMMDDHHmmss timestamp. ' +
      'A string of zeroes (e.g. "000") zero-pads to that width.',
  )

const DoctypeValueSchema = z
  .object({
    dir: z
      .string()
      .describe(
        "Directory where files of this doctype are stored. Relative paths are resolved from the config file location.",
      ),
    sequenceScheme: SequenceSchemeSchema,
    sequenceSeparator: z
      .string()
      .min(1)
      .regex(/^[^\\/\x00]+$/)
      .default(".")
      .describe(
        "Separator between the sequence number and the slug in generated filenames.",
      ),
    defaultProperties: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Properties to use as frontmatter when creating new files. " +
          "If omitted, defaults to { created_on: '{{date}}', status: 'open' }. " +
          "An explicit empty object {} disables default properties.",
      ),
  })
  .describe("Configuration for a single doctype.")

const GitHubUpstreamSchema = z
  .object({
    github: z.string().describe('GitHub repository in "owner/repo" format.'),
    path: z.string().describe("Path within the repository."),
  })
  .describe("GitHub repository upstream source.")

const SyncSpecSchema = z
  .object({
    upstream: z
      .union([z.string(), GitHubUpstreamSchema])
      .describe(
        "Upstream source. A string for local paths, or a { github, path } object for GitHub repos.",
      ),
    local: z
      .string()
      .describe(
        "Local destination path, relative to project directory or absolute.",
      ),
    mode: z
      .enum(["receive_merge", "receive_mirror"])
      .default("receive_merge")
      .describe(
        '"receive_merge" adds/updates only. "receive_mirror" makes local an exact copy (deletes extras).',
      ),
  })
  .describe("A single sync specification.")

export const ProjectSchema = z
  .object({
    extend: z
      .boolean()
      .default(false)
      .describe(
        "Reserved for future use. When true, this config will extend a parent config.",
      ),
    doctypes: z
      .record(DoctypeKeySchema, DoctypeValueSchema)
      .default({})
      .describe("Map of doctype names to their configuration."),
    sync: z
      .array(SyncSpecSchema)
      .default([])
      .describe("File synchronization specifications."),
    subcontextDoctype: z
      .string()
      .optional()
      .describe("Name of the doctype that serves as the subcontext container."),
    managedDoctypes: z
      .array(DoctypeKeySchema)
      .default([])
      .describe("Doctypes whose files live inside subcontext directories."),
  })
  .superRefine((data, ctx) => {
    for (const key of Object.keys(data.doctypes)) {
      if (key === "sub") {
        ctx.addIssue({
          code: "custom",
          message: '"sub" is reserved and cannot be used as a doctype name',
          path: ["doctypes", key],
        })
      }
    }

    if (data.subcontextDoctype !== undefined) {
      if (!(data.subcontextDoctype in data.doctypes)) {
        ctx.addIssue({
          code: "custom",
          message: `subcontextDoctype references unknown doctype: "${data.subcontextDoctype}"`,
          path: ["subcontextDoctype"],
        })
      }
      if (data.managedDoctypes.includes(data.subcontextDoctype)) {
        ctx.addIssue({
          code: "custom",
          message: `subcontextDoctype "${data.subcontextDoctype}" must not appear in managedDoctypes`,
          path: ["managedDoctypes"],
        })
      }
    }

    for (const key of data.managedDoctypes) {
      if (!(key in data.doctypes)) {
        ctx.addIssue({
          code: "custom",
          message: `managedDoctypes references unknown doctype: "${key}"`,
          path: ["managedDoctypes"],
        })
      }
    }

    const dirToDoctype = new Map<string, string>()
    for (const [key, value] of Object.entries(data.doctypes)) {
      const existing = dirToDoctype.get(value.dir)
      if (existing) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate directory "${value.dir}": used by both "${existing}" and "${key}"`,
          path: ["doctypes", key, "dir"],
        })
      } else {
        dirToDoctype.set(value.dir, key)
      }
    }
  })
  .describe("MCM configuration file.")

export type Project = z.infer<typeof ProjectSchema>
export type DoctypeEntry = z.infer<typeof DoctypeValueSchema>
export enum DoctypeRole {
  Regular = "regular",
  Subcontext = "subcontext",
  Managed = "managed",
}
export type ResolvedDoctypeEntry = DoctypeEntry & { role: DoctypeRole }

export type LocalFsUpstream = { kind: "localfs"; path: string }
export type GitHubUpstream = { kind: "github"; repo: string; path: string }
export type ResolvedUpstream = LocalFsUpstream | GitHubUpstream

export type ResolvedSyncSpec = {
  upstream: ResolvedUpstream
  local: string
  mode: "receive_merge" | "receive_mirror"
}

export type ResolvedProject = Omit<Project, "sync" | "doctypes"> & {
  projectFile: string
  projectDir: string
  rawConfig: Project
  doctypes: Record<string, ResolvedDoctypeEntry>
  sync: ResolvedSyncSpec[]
  currentSubcontext: string | false
}

function normalizeGitHubRepo(input: string): string {
  return input.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")
}

export function parseProject(raw: unknown): Project {
  return ProjectSchema.parse(raw)
}

export function loadJSONFile(filePath: string): unknown {
  const content = readFileSync(filePath, "utf-8")
  return JSON.parse(content)
}

export function resolveDoctypeArg(
  project: ResolvedProject,
  doctype: string,
): string {
  if (doctype === "sub") {
    if (!project.rawConfig.subcontextDoctype) {
      abortError("No subcontext doctype configured")
    }
    return project.rawConfig.subcontextDoctype
  }
  return doctype
}

export function loadRawProject(
  raw: unknown,
  projectFile: string,
  opts?: { subcontext?: string },
): ResolvedProject {
  const project = parseProject(raw)
  const resolvedProjectFile = resolve(projectFile)
  const projectDir = dirname(resolvedProjectFile)

  const managedSet = new Set(project.managedDoctypes)
  const subcontextDoctypeKey = project.subcontextDoctype

  // Derive subcontextsAbsDir from the subcontext doctype's dir
  let subcontextsAbsDir: string | undefined
  if (subcontextDoctypeKey && subcontextDoctypeKey in project.doctypes) {
    const subDoctypeDir = project.doctypes[subcontextDoctypeKey].dir
    subcontextsAbsDir = isAbsolute(subDoctypeDir)
      ? subDoctypeDir
      : join(projectDir, subDoctypeDir)
  }

  const subcontextName = opts?.subcontext

  const resolvedDoctypes: Record<string, ResolvedDoctypeEntry> = {}
  for (const [key, value] of Object.entries(project.doctypes)) {
    let role: DoctypeRole
    if (key === subcontextDoctypeKey) {
      role = DoctypeRole.Subcontext
    } else if (managedSet.has(key)) {
      role = DoctypeRole.Managed
    } else {
      role = DoctypeRole.Regular
    }

    let dir: string
    if (role === DoctypeRole.Managed && subcontextName && subcontextsAbsDir) {
      dir = join(subcontextsAbsDir, subcontextName, value.dir)
    } else {
      dir = isAbsolute(value.dir) ? value.dir : join(projectDir, value.dir)
    }
    resolvedDoctypes[key] = { ...value, dir, role }
  }

  const resolvedSync: ResolvedSyncSpec[] = project.sync.map((spec) => {
    let upstream: ResolvedUpstream
    if (typeof spec.upstream === "string") {
      upstream = {
        kind: "localfs",
        path: isAbsolute(spec.upstream)
          ? spec.upstream
          : resolve(projectDir, spec.upstream),
      }
    } else {
      upstream = {
        kind: "github",
        repo: normalizeGitHubRepo(spec.upstream.github),
        path: spec.upstream.path.replace(/^\//, ""),
      }
    }
    return {
      upstream,
      local: isAbsolute(spec.local)
        ? spec.local
        : resolve(projectDir, spec.local),
      mode: spec.mode,
    }
  })

  return {
    ...project,
    rawConfig: project,
    projectFile: resolvedProjectFile,
    projectDir,
    doctypes: resolvedDoctypes,
    sync: resolvedSync,
    currentSubcontext: subcontextName || false,
  }
}

function resolveSubcontextName(base: ResolvedProject, sub: string): string {
  const subDoctypeKey = base.rawConfig.subcontextDoctype
  if (!subDoctypeKey) abortError("No subcontext doctype configured")
  const subEntry = base.doctypes[subDoctypeKey]
  if (!subEntry) abortError(`Subcontext doctype "${subDoctypeKey}" not found`)
  const subcontextsAbsDir = subEntry.dir

  const result = resolveSubcontextArg(subcontextsAbsDir, sub)
  if (typeof result === "string") return result
  if (result.error === "not-found") abortError(`Subcontext not found: ${sub}`)
  abortError(`Multiple subcontexts match: ${result.names.join(", ")}`)
}

export function getProject(opts?: { sub?: string }): ResolvedProject {
  const projectPath = locateProjectFile(process.cwd())
  if (!projectPath) {
    abortError("Could not find .mcm.json configuration file")
  }

  let raw: unknown
  try {
    raw = loadJSONFile(projectPath)
  } catch (err) {
    abortError(
      `Failed to read project file: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  let base: ResolvedProject
  try {
    base = loadRawProject(raw, projectPath)
  } catch (err) {
    abortError(
      `Invalid project configuration: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!base.rawConfig.subcontextDoctype) return base

  const subcontextName = opts?.sub
    ? resolveSubcontextName(base, opts.sub)
    : getCurrentSubcontext(base.projectDir)

  if (!subcontextName) return base

  try {
    return loadRawProject(raw, projectPath, { subcontext: subcontextName })
  } catch (err) {
    abortError(
      `Invalid project configuration: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export type DoctypeFileEntry = { dir: string; files: string[] }

export function listDoctypeFilesAcrossSubcontexts(
  project: ResolvedProject,
  doctypeKey: string,
): DoctypeFileEntry[] {
  const entry = project.doctypes[doctypeKey]

  if (entry.role === DoctypeRole.Subcontext) {
    return listBriefFiles(entry.dir)
  }

  if (entry.role !== DoctypeRole.Managed) {
    let files: string[] = []
    try {
      files = readdirSync(entry.dir)
    } catch {
      // treat missing dir as empty
    }
    return [{ dir: entry.dir, files }]
  }

  // managed doctype: scan across all subcontexts
  const subDoctypeKey = project.rawConfig.subcontextDoctype!
  const subEntry = project.doctypes[subDoctypeKey]
  const subcontextsAbsDir = subEntry.dir

  const subDirs = listSubcontexts(subcontextsAbsDir)
  const rawDoctypeDir = project.rawConfig.doctypes[doctypeKey].dir

  const result: DoctypeFileEntry[] = []
  for (const subDir of subDirs) {
    const dir = join(subcontextsAbsDir, subDir, rawDoctypeDir)
    let files: string[] = []
    try {
      files = readdirSync(dir)
    } catch {
      // silently skip missing dirs
    }
    result.push({ dir, files })
  }
  return result
}

export function locateProjectFile(cwd: string): string | null {
  let dir = resolve(cwd)

  for (;;) {
    try {
      const candidate = join(dir, ".mcm.json")
      if (existsSync(candidate)) return candidate
    } catch {
      return null
    }

    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
