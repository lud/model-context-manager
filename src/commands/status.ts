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
  none: number
  other: number
  namedStatuses: Record<string, number>
}

function countFiles(paths: string[]): DoctypeCounts {
  let done = 0
  let explicitActive = 0
  let none = 0
  let other = 0
  const namedStatuses: Record<string, number> = {}

  for (const fullPath of paths) {
    const content = readFileSyncOrAbort(fullPath, "utf-8")
    const { data } = parseFrontmatter(content)
    const status = data.status

    if (status === "done") {
      done++
      continue
    }

    if (status === "active") {
      // Keep explicit "active" within the parent active bucket, not as a named child status.
      explicitActive++
      continue
    }

    if (status === "" || status === null || status === undefined) {
      none++
      continue
    }

    if (typeof status === "string") {
      namedStatuses[status] = (namedStatuses[status] ?? 0) + 1
      continue
    }

    other++
  }

  const namedActiveTotal = Object.values(namedStatuses).reduce(
    (sum, count) => sum + count,
    0,
  )

  const active = explicitActive + none + namedActiveTotal + other

  return {
    total: active + done,
    active,
    done,
    none,
    other,
    namedStatuses,
  }
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

function formatActiveBreakdown(counts: DoctypeCounts): string {
  const parts: string[] = []

  if (counts.none > 0) {
    parts.push(`(none) ${counts.none}`)
  }

  const named = Object.keys(counts.namedStatuses)
    .filter((name) => name !== "done")
    .sort((a, b) => a.localeCompare(b))

  for (const name of named) {
    parts.push(`${name} ${counts.namedStatuses[name]}`)
  }

  if (counts.other > 0) {
    parts.push(`(other) ${counts.other}`)
  }

  return parts.join(", ")
}

export function formatCountLines(
  name: string,
  counts: DoctypeCounts,
  maxNameLen: number,
): string[] {
  const padded = name.padEnd(maxNameLen)
  const lines = [
    `  ${padded}  active ${String(counts.active).padStart(4)}`,
    `  ${padded}  done   ${String(counts.done).padStart(4)}`,
  ]

  const activeBreakdown = formatActiveBreakdown(counts)
  if (activeBreakdown !== "") {
    lines[0] += ` - ${activeBreakdown}`
  }

  return lines
}

function printDoctypeCounts(
  name: string,
  counts: DoctypeCounts,
  maxNameLen: number,
): void {
  for (const line of formatCountLines(name, counts, maxNameLen)) {
    cli.writeln(line)
  }
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
    printDoctypeCounts(name, counts, maxNameLen)
  }

  cli.writeln("")

  const subDoctypeKey = project.rawConfig.subcontextDoctype
  if (!subDoctypeKey) {
    cli.writeln("Subcontext doctype: none")
    cli.writeln("Current subcontext: none")
    return
  }

  cli.writeln(`Subcontext doctype: ${subDoctypeKey}`)

  if (!project.currentSubcontext) {
    cli.writeln("Current subcontext: none")
    return
  }

  const subEntry = project.doctypes[subDoctypeKey]
  const briefPath = join(
    subEntry.dir,
    project.currentSubcontext,
    `${project.currentSubcontext}.md`,
  )

  cli.writeln(`Current subcontext: ${toDisplayPath(briefPath, process.cwd())}`)

  const managedNames = project.rawConfig.managedDoctypes
  if (managedNames.length === 0) return

  const maxManagedLen = Math.max(...managedNames.map((n) => n.length))

  for (const name of managedNames) {
    const entry = project.doctypes[name]
    const counts = countScopedManaged(entry)
    printDoctypeCounts(name, counts, maxManagedLen)
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
