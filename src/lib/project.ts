import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { z } from "zod"
import { abortError } from "./cli.js"
import { getCurrentSubcontext } from "./global-config.js"
import { listSubcontexts, resolveSubcontextArg } from "./subcontext.js"

export const DoctypeKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]+$/)
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

const SubcontextsSchema = z
  .object({
    dir: z
      .string()
      .describe(
        "Directory where subcontext directories are created. Relative paths are resolved from the config file location.",
      ),
    doctypes: z
      .array(DoctypeKeySchema)
      .min(1)
      .describe("Doctypes managed by subcontexts."),
  })
  .describe("Subcontexts configuration.")

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
    subcontexts: SubcontextsSchema.optional(),
  })
  .describe("MCM configuration file.")

export type Project = z.infer<typeof ProjectSchema>
export type DoctypeEntry = z.infer<typeof DoctypeValueSchema>
export type ResolvedDoctypeEntry = DoctypeEntry & { inSubcontext: boolean }

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

export function loadRawProject(
  raw: unknown,
  projectFile: string,
  opts?: { subcontext?: string },
): ResolvedProject {
  const project = parseProject(raw)
  const resolvedProjectFile = resolve(projectFile)
  const projectDir = dirname(resolvedProjectFile)

  const managedDoctypes = new Set(project.subcontexts?.doctypes ?? [])
  if (project.subcontexts) {
    for (const key of managedDoctypes) {
      if (!(key in project.doctypes)) {
        throw new Error(`Subcontexts references unknown doctype: "${key}"`)
      }
    }
  }

  const subcontextsAbsDir = project.subcontexts
    ? isAbsolute(project.subcontexts.dir)
      ? project.subcontexts.dir
      : join(projectDir, project.subcontexts.dir)
    : undefined

  const subcontextName = opts?.subcontext

  const resolvedDoctypes: Record<string, ResolvedDoctypeEntry> = {}
  for (const [key, value] of Object.entries(project.doctypes)) {
    const inSubcontext = managedDoctypes.has(key)
    let dir: string
    if (inSubcontext && subcontextName && subcontextsAbsDir) {
      dir = join(subcontextsAbsDir, subcontextName, value.dir)
    } else {
      dir = isAbsolute(value.dir) ? value.dir : join(projectDir, value.dir)
    }
    resolvedDoctypes[key] = { ...value, dir, inSubcontext }
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
  const subcontextsAbsDir = isAbsolute(base.subcontexts!.dir)
    ? base.subcontexts!.dir
    : join(base.projectDir, base.subcontexts!.dir)

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

  if (!base.subcontexts) return base

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

  if (!entry.inSubcontext) {
    let files: string[] = []
    try {
      files = readdirSync(entry.dir)
    } catch {
      // treat missing dir as empty
    }
    return [{ dir: entry.dir, files }]
  }

  const rawSubcontextsDir = project.rawConfig.subcontexts!.dir
  const subcontextsAbsDir = isAbsolute(rawSubcontextsDir)
    ? rawSubcontextsDir
    : join(project.projectDir, rawSubcontextsDir)

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
