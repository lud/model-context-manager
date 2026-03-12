import { command } from "cleye"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import {
  getProject,
  listDoctypeFilesAcrossSubcontexts,
  DoctypeRole,
  type ResolvedProject,
  type ResolvedDoctypeEntry,
} from "../lib/project.js"
import { readdirSyncOrAbort, readFileSyncOrAbort } from "../lib/fs.js"
import { parseFrontmatter } from "../lib/frontmatter.js"
import { toDisplayPath } from "../lib/paths.js"

export type DoctypeCounts = {
  total: number
  active: number
  done: number
}

function isDone(data: Record<string, unknown>): boolean {
  return data.status === "done"
}

function countFiles(paths: string[]): DoctypeCounts {
  let active = 0
  let done = 0
  for (const fullPath of paths) {
    const content = readFileSyncOrAbort(fullPath, "utf-8")
    const { data } = parseFrontmatter(content)
    if (isDone(data)) {
      done++
    } else {
      active++
    }
  }
  return { total: active + done, active, done }
}

function collectRegularFiles(entry: ResolvedDoctypeEntry): string[] {
  const files = readdirSyncOrAbort(entry.dir).slice().sort()
  return files.map((f) => join(entry.dir, f))
}

function collectGlobalFiles(
  project: ResolvedProject,
  doctype: string,
): string[] {
  const paths: string[] = []
  for (const { dir, files } of listDoctypeFilesAcrossSubcontexts(
    project,
    doctype,
  )) {
    for (const file of files.slice().sort()) {
      paths.push(join(dir, file))
    }
  }
  return paths
}

function collectScopedManagedFiles(entry: ResolvedDoctypeEntry): string[] {
  let files: string[]
  try {
    files = readdirSyncOrAbort(entry.dir).slice().sort()
  } catch {
    return []
  }
  return files.map((f) => join(entry.dir, f))
}

export function countDoctype(
  project: ResolvedProject,
  doctype: string,
): DoctypeCounts {
  const entry = project.doctypes[doctype]
  switch (entry.role) {
    case DoctypeRole.Subcontext:
    case DoctypeRole.Managed:
      return countFiles(collectGlobalFiles(project, doctype))
    case DoctypeRole.Regular:
      return countFiles(collectRegularFiles(entry))
  }
}

export function countScopedManaged(entry: ResolvedDoctypeEntry): DoctypeCounts {
  return countFiles(collectScopedManagedFiles(entry))
}

export function formatCountLine(
  name: string,
  counts: DoctypeCounts,
  maxNameLen: number,
): string {
  const padded = name.padEnd(maxNameLen)
  const parts = [`${counts.active} active`, `${counts.done} done`]
  return `  ${padded}  ${String(counts.total).padStart(4)} (${parts.join(", ")})`
}

export function printStatus(project: ResolvedProject): void {
  cli.writeln(`Current project: ${project.projectDir}`)

  const doctypeNames = Object.keys(project.doctypes)
  if (doctypeNames.length === 0) {
    cli.warning("No doctypes configured.")
    return
  }

  const maxNameLen = Math.max(...doctypeNames.map((n) => n.length))

  // Global counts for all doctypes
  for (const name of doctypeNames) {
    const counts = countDoctype(project, name)
    cli.writeln(formatCountLine(name, counts, maxNameLen))
  }

  // Subcontext section
  if (!project.currentSubcontext) return

  const subDoctypeKey = project.rawConfig.subcontextDoctype
  if (!subDoctypeKey) return

  const subEntry = project.doctypes[subDoctypeKey]
  const briefPath = join(
    subEntry.dir,
    project.currentSubcontext,
    `${project.currentSubcontext}.md`,
  )

  cli.writeln("")
  cli.writeln(`Current subcontext: ${toDisplayPath(briefPath, process.cwd())}`)

  const managedNames = project.rawConfig.managedDoctypes
  if (managedNames.length === 0) return

  const maxManagedLen = Math.max(...managedNames.map((n) => n.length))

  for (const name of managedNames) {
    const entry = project.doctypes[name]
    const counts = countScopedManaged(entry)
    cli.writeln(formatCountLine(name, counts, maxManagedLen))
  }
}

export const statusCommand = command(
  {
    name: "status",
    help: { description: "Show project status overview" },
    flags: {
      sub: {
        type: String,
        description: "Use a specific subcontext",
      },
    },
  },
  (argv) => {
    const project = getProject({ sub: argv.flags?.sub })
    printStatus(project)
  },
)
