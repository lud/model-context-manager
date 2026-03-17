import { existsSync } from "node:fs"
import { isAbsolute, join, resolve, dirname } from "node:path"
import { abortError } from "./cli.js"
import { parseSeqPrefix } from "./sequence.js"
import type { ResolvedProject, DoctypeFileEntry } from "./project.js"
import { listDoctypeFilesAcrossSubcontexts } from "./project.js"

/**
 * Check if a string is composed entirely of digits.
 */
function isDigitsOnly(s: string): boolean {
  return /^\d+$/.test(s)
}

/**
 * Strip the .md extension from a filename, if present.
 */
function stripMdExtension(filename: string): string {
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename
}

/**
 * Try to find a file by matching against its sequence prefix as an integer.
 * Returns the absolute path if found, null otherwise.
 */
function findByIntPrefix(
  entries: DoctypeFileEntry[],
  separator: string,
  target: number,
): string | null {
  for (const { dir, files } of entries) {
    for (const file of files) {
      const parsed = parseSeqPrefix(file, separator)
      if (parsed !== null && parsed.seq === target) {
        return join(dir, file)
      }
    }
  }
  return null
}

/**
 * Try to find a file by matching against its exact datetime prefix.
 * Returns the absolute path if found, null otherwise.
 */
function findByExactPrefix(
  entries: DoctypeFileEntry[],
  separator: string,
  prefix: string,
): string | null {
  for (const { dir, files } of entries) {
    for (const file of files) {
      const idx = file.indexOf(separator)
      if (idx > 0 && file.slice(0, idx) === prefix) {
        return join(dir, file)
      }
    }
  }
  return null
}

/**
 * Try to find a file by matching against its exact slug (filename without
 * prefix and without .md extension).
 * Returns the absolute path if found, null otherwise.
 */
function findBySlug(
  entries: DoctypeFileEntry[],
  separator: string,
  slug: string,
): string | null {
  for (const { dir, files } of entries) {
    for (const file of files) {
      const parsed = parseSeqPrefix(file, separator)
      if (parsed !== null) {
        // sequenced file: slug is after the prefix, without .md
        if (stripMdExtension(parsed.slug) === slug) {
          return join(dir, file)
        }
      } else {
        // no prefix: match the whole filename without .md
        if (stripMdExtension(file) === slug) {
          return join(dir, file)
        }
      }
    }
  }
  return null
}

/**
 * Resolve a file from two arguments: doctype name + identifier.
 *
 * Matching cascade:
 * 1. If the doctype uses a zeroes scheme and the id is a pure integer,
 *    try matching by integer prefix.
 * 2. If the doctype uses datetime scheme and the id is a pure integer,
 *    try matching by exact prefix string.
 * 3. Try matching by exact slug.
 */
export function resolveFromDoctypeAndId(
  project: ResolvedProject,
  doctypeKey: string,
  id: string,
): string {
  const entry = project.doctypes[doctypeKey]
  if (!entry) {
    abortError(`Unknown doctype: ${doctypeKey}`)
  }

  const entries = listDoctypeFilesAcrossSubcontexts(project, doctypeKey)
  const separator = entry.sequenceSeparator
  const scheme = entry.sequenceScheme

  // 1. Zeroes scheme + pure integer argument → match by integer prefix
  if (scheme !== "none" && scheme !== "datetime" && isDigitsOnly(id)) {
    const target = parseInt(id, 10)
    const found = findByIntPrefix(entries, separator, target)
    if (found) return found
  }

  // 2. Datetime scheme + pure integer argument → match by exact prefix
  if (scheme === "datetime" && isDigitsOnly(id)) {
    const found = findByExactPrefix(entries, separator, id)
    if (found) return found
  }

  // 3. Match by exact slug
  const found = findBySlug(entries, separator, id)
  if (found) return found

  abortError(`Could not find file matching "${id}" in doctype "${doctypeKey}"`)
}

/**
 * Locate an absolute path from a potentially relative argument.
 * Tries: absolute as-is, joined with cwd, joined with projectDir.
 * Returns the first existing path, or aborts.
 */
function locateFile(
  arg: string,
  cwd: string,
  projectDir: string,
): string {
  if (isAbsolute(arg)) {
    if (existsSync(arg)) return arg
    abortError(`File not found: ${arg}`)
  }

  const fromCwd = resolve(cwd, arg)
  if (existsSync(fromCwd)) return fromCwd

  const fromProject = resolve(projectDir, arg)
  if (existsSync(fromProject)) return fromProject

  abortError(`File not found: ${arg}`)
}

/**
 * Validate that an absolute file path belongs to a doctype directory
 * in the project. Returns the path if valid, aborts otherwise.
 */
function validateProjectFile(
  absPath: string,
  project: ResolvedProject,
): string {
  const parentDir = dirname(absPath)

  for (const [, entry] of Object.entries(project.doctypes)) {
    // Direct match: file is in a doctype directory
    if (resolve(parentDir) === resolve(entry.dir)) {
      return absPath
    }
  }

  // Check for managed doctypes: file could be inside a subcontext subdirectory
  // e.g. features/001.foo/notes/001.bar.md
  // parentDir = features/001.foo/notes, grandparentDir = features/001.foo
  if (project.rawConfig.subcontextDoctype) {
    const subDoctypeKey = project.rawConfig.subcontextDoctype
    const subEntry = project.doctypes[subDoctypeKey]
    if (subEntry) {
      const subcontextsAbsDir = resolve(subEntry.dir)
      const grandparentDir = dirname(parentDir)

      // Check if grandparent is a subcontext directory
      const grandGrandparentDir = dirname(grandparentDir)
      if (resolve(grandGrandparentDir) === subcontextsAbsDir) {
        // parentDir should match a managed doctype's raw dir
        const parentBasename = parentDir.slice(grandparentDir.length + 1)
        for (const key of project.rawConfig.managedDoctypes) {
          const rawDir = project.rawConfig.doctypes[key]?.dir
          if (rawDir === parentBasename) {
            return absPath
          }
        }
      }

      // Also check for subcontext brief files: features/001.foo/001.foo.md
      if (resolve(grandparentDir) === subcontextsAbsDir) {
        return absPath
      }
    }
  }

  abortError(
    `File is not part of any doctype in the project: ${absPath}`,
  )
}

/**
 * Resolve a file from a single path argument.
 *
 * 1. Locate the file (absolute, relative to cwd, relative to projectDir)
 * 2. Validate it belongs to a project doctype
 */
export function resolveFromPath(
  project: ResolvedProject,
  arg: string,
  cwd: string,
): string {
  const absPath = locateFile(arg, cwd, project.projectDir)
  return validateProjectFile(absPath, project)
}

/**
 * Resolve a file argument to an absolute path.
 *
 * Supports two forms:
 * - Two arguments: `<doctype> <id>` — looks up by doctype + prefix/slug
 * - One argument: `<path>` — locates file and validates it's a project file
 */
export function resolveFileArg(
  project: ResolvedProject,
  args: [string, string] | [string],
  cwd: string,
): string {
  if (args.length === 2) {
    const [doctypeKey, id] = args
    if (!(doctypeKey in project.doctypes)) {
      abortError(`Unknown doctype: ${doctypeKey}`)
    }
    return resolveFromDoctypeAndId(project, doctypeKey, id)
  }

  return resolveFromPath(project, args[0], cwd)
}
