import { command } from "cleye"
import { readdirSyncOrAbort, readFileSyncOrAbort } from "../lib/fs.js"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import {
  getProject,
  listDoctypeFilesAcrossSubcontexts,
  resolveDoctypeArg,
} from "../lib/project.js"
import { DoctypeRole } from "../lib/project.js"
import type { ResolvedProject } from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import { parseFrontmatter } from "../lib/frontmatter.js"

export type ListFilters = {
  tags: string[]
  active: boolean
  done: boolean
  status?: string
  is: Array<{ key: string; value: string }>
  first: boolean
}

type ListPredicate = (data: Record<string, unknown>) => boolean

const EMPTY_FILTERS: ListFilters = {
  tags: [],
  active: false,
  done: false,
  status: undefined,
  is: [],
  first: false,
}

function parseIs(s: string): { key: string; value: string } {
  const idx = s.indexOf(":")
  if (idx === -1)
    cli.abortError(`Invalid --is format (expected key:value): ${s}`)
  return { key: s.slice(0, idx), value: s.slice(idx + 1) }
}

// Exported for testing
export function propMatches(
  data: Record<string, unknown>,
  key: string,
  value: string,
): boolean {
  if (!(key in data)) return false
  const actual = data[key]
  if (value === "") {
    return actual === "" || actual === null
  }
  return String(actual) === value
}

// Exported for testing
export function matchesFilters(
  data: Record<string, unknown>,
  filters: ListFilters,
): boolean {
  const predicates: ListPredicate[] = []

  if (filters.active) {
    predicates.push((item) => item.status !== "done")
  }

  if (filters.done) {
    predicates.push((item) => item.status === "done")
  }

  if (filters.status !== undefined) {
    const statusValue = filters.status
    predicates.push((item) => propMatches(item, "status", statusValue))
  }

  if (filters.tags.length > 0) {
    predicates.push((item) => {
      const tags = Array.isArray(item.tags) ? (item.tags as unknown[]) : []
      return filters.tags.every((t) => tags.includes(t))
    })
  }

  for (const { key, value } of filters.is) {
    predicates.push((item) => propMatches(item, key, value))
  }

  return predicates.every((predicate) => predicate(data))
}

function filtersActive(f: ListFilters): boolean {
  return (
    f.active ||
    f.done ||
    f.status !== undefined ||
    f.tags.length > 0 ||
    f.is.length > 0
  )
}

function useGlobalScan(
  project: ResolvedProject,
  doctype: string,
  allSubcontexts: boolean,
): boolean {
  const entry = project.doctypes[doctype]
  if (allSubcontexts) return true
  switch (entry.role) {
    case DoctypeRole.Subcontext:
      return true
    case DoctypeRole.Managed:
      return !project.currentSubcontext
    case DoctypeRole.Regular:
      return false
  }
}

function* yieldDoctypeFilePaths(
  project: ResolvedProject,
  doctype: string,
  allSubcontexts: boolean,
): Generator<string> {
  const entry = project.doctypes[doctype]

  if (useGlobalScan(project, doctype, allSubcontexts)) {
    for (const { dir, files } of listDoctypeFilesAcrossSubcontexts(
      project,
      doctype,
    )) {
      for (const file of files.slice().sort()) {
        yield join(dir, file)
      }
    }
  } else {
    const files = readdirSyncOrAbort(entry.dir).slice().sort()
    for (const file of files) {
      yield join(entry.dir, file)
    }
  }
}

export const listCommand = command(
  {
    name: "list",
    parameters: ["[doctype]"],
    help: { description: "List doctypes or files in a doctype" },
    flags: {
      sub: {
        type: String,
        description: "Use a specific subcontext",
      },
      allSubcontexts: {
        type: Boolean,
        alias: "S",
        description: "Search all subcontexts, ignoring the current one",
        default: false,
      },
      tag: {
        type: [String],
        description: "Filter by tag (repeatable; all tags must match)",
      },
      active: {
        type: Boolean,
        description: "Only active documents (status != 'done')",
        default: false,
      },
      done: {
        type: Boolean,
        description: "Only done documents (status == 'done')",
        default: false,
      },
      status: {
        type: String,
        description: "Filter by status",
      },
      is: {
        type: [String],
        description: "Filter by property (key:value, repeatable)",
      },
      first: {
        type: Boolean,
        description: "Return only the first matching result",
        default: false,
      },
    },
  },
  (argv) => {
    const project = getProject({ sub: argv.flags?.sub })
    const doctype =
      argv._.doctype !== undefined
        ? resolveDoctypeArg(project, argv._.doctype)
        : undefined

    const hasFilterFlags =
      argv.flags?.tag?.length ||
      argv.flags?.active ||
      argv.flags?.done ||
      argv.flags?.status !== undefined ||
      argv.flags?.is?.length ||
      argv.flags?.first ||
      argv.flags?.allSubcontexts

    if (hasFilterFlags && doctype === undefined) {
      cli.abortError("Filter flags require a doctype argument")
    }

    if (argv.flags?.active && argv.flags?.done) {
      cli.abortError("--active and --done cannot be used together")
    }

    const filters: ListFilters = {
      tags: argv.flags?.tag ?? [],
      active: argv.flags?.active ?? false,
      done: argv.flags?.done ?? false,
      status: argv.flags?.status,
      is: (argv.flags?.is ?? []).map(parseIs),
      first: argv.flags?.first ?? false,
    }

    if (doctype === undefined) {
      listAllDoctypes(project.doctypes)
    } else {
      listDoctypeFiles(
        project,
        doctype,
        filters,
        argv.flags?.allSubcontexts ?? false,
      )
    }
  },
)

export function listAllDoctypes(doctypes: ResolvedProject["doctypes"]): void {
  const entries = Object.entries(doctypes)
  if (entries.length === 0) {
    cli.warning("No doctypes configured.")
    return
  }
  for (const [key, { dir }] of entries) {
    cli.writeln(`${key}: ${toDisplayPath(dir, process.cwd())}`)
  }
}

export function listDoctypeFiles(
  project: ResolvedProject,
  doctype: string,
  filters: ListFilters = EMPTY_FILTERS,
  allSubcontexts = false,
): void {
  const entry = project.doctypes[doctype]
  if (!entry) cli.abortError(`Unknown doctype: ${doctype}`)

  const active = filtersActive(filters)

  for (const fullPath of yieldDoctypeFilePaths(
    project,
    doctype,
    allSubcontexts,
  )) {
    if (active) {
      const content = readFileSyncOrAbort(fullPath, "utf-8")
      const { data } = parseFrontmatter(content)
      if (!matchesFilters(data, filters)) continue
    }
    cli.writeln(toDisplayPath(fullPath, process.cwd()))
    if (filters.first) break
  }
}

/**
 * List all configured doctypes or the files within a specific doctype.
 *
 * ## Examples
 *
 * ```sh
 * # List all doctypes
 * mcm list
 *
 * # List files in a doctype
 * mcm list devlogs
 * ```
 */
export function commentDoc() {}
