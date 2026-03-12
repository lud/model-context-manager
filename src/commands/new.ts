import { command } from "cleye"
import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { mkdirSyncOrAbort, writeFileSyncOrAbort } from "../lib/fs.js"
import { join } from "node:path"
import * as cli from "../lib/cli.js"
import { applyTemplates, prependFrontmatter } from "../lib/frontmatter.js"
import {
  getProject,
  listDoctypeFilesAcrossSubcontexts,
  resolveDoctypeArg,
} from "../lib/project.js"
import { DoctypeRole } from "../lib/project.js"
import type { ResolvedDoctypeEntry, ResolvedProject } from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import { nextFilename } from "../lib/sequence.js"
import { slugify } from "../lib/slugify.js"
import { listSubcontexts, nextSubcontextDirName } from "../lib/subcontext.js"
import { setCurrentSubcontext } from "../lib/global-config.js"

export function resolveEditor(): string | undefined {
  if (process.env.MCM_EDITOR) return process.env.MCM_EDITOR
  if (process.env.EDITOR) return process.env.EDITOR
  if (process.platform === "darwin") return "open"
  if (process.platform === "win32") return "start"
  return "xdg-open"
}

type NewFileTarget = {
  filePath: string
  warnOnEmptyProperties: boolean
  afterWrite?: () => void
}

function resolveNewFileTarget(
  project: ResolvedProject,
  entry: ResolvedDoctypeEntry,
  doctype: string,
  slug: string,
): NewFileTarget {
  switch (entry.role) {
    case DoctypeRole.Subcontext:
      return resolveSubcontextTarget(project, entry, slug)
    case DoctypeRole.Managed:
    case DoctypeRole.Regular:
      return resolveFileTarget(project, entry, doctype, slug)
  }
}

function resolveSubcontextTarget(
  project: ResolvedProject,
  entry: ResolvedDoctypeEntry,
  slug: string,
): NewFileTarget {
  const existingDirs = listSubcontexts(entry.dir)
  const dirName = nextSubcontextDirName(existingDirs, slug)
  const subcontextPath = join(entry.dir, dirName)

  if (!existsSync(entry.dir)) {
    mkdirSyncOrAbort(entry.dir, { recursive: true })
  }

  mkdirSyncOrAbort(subcontextPath, { recursive: true })

  for (const key of project.rawConfig.managedDoctypes) {
    const rawDir = project.rawConfig.doctypes[key]?.dir
    if (rawDir) {
      mkdirSyncOrAbort(join(subcontextPath, rawDir), { recursive: true })
    }
  }

  return {
    filePath: join(subcontextPath, `${dirName}.md`),
    warnOnEmptyProperties: false,
    afterWrite: () => setCurrentSubcontext(project.projectDir, dirName),
  }
}

function resolveFileTarget(
  project: ResolvedProject,
  entry: ResolvedDoctypeEntry,
  doctype: string,
  slug: string,
): NewFileTarget {
  if (!existsSync(entry.dir)) {
    mkdirSyncOrAbort(entry.dir, { recursive: true })
  }

  const allEntries = listDoctypeFilesAcrossSubcontexts(project, doctype)
  const files = allEntries.flatMap((e) => e.files)
  const filename = nextFilename(files, entry, slug)
  const filePath = join(entry.dir, filename)

  if (existsSync(filePath)) {
    cli.abortError(`File already exists: ${filePath}`)
  }

  return { filePath, warnOnEmptyProperties: true }
}

const BUILT_IN_DEFAULT_PROPERTIES = { created_on: "{{date}}", status: "active" }

export const newCommand = command(
  {
    name: "new",
    parameters: ["<doctype>", "<title...>"],
    help: { description: "Create a new file in a doctype" },
    flags: {
      sub: {
        type: String,
        description: "Use a specific subcontext",
      },
      open: {
        type: Boolean,
        alias: "o",
        description:
          "Open the created file with $MCM_EDITOR, $EDITOR, or xdg-open",
        default: false,
      },
    },
  },
  (argv) => {
    const project = getProject({ sub: argv.flags?.sub })
    const doctype = resolveDoctypeArg(project, argv._.doctype)
    const titleWords: string[] = argv._.title

    const entry = project.doctypes[doctype]
    if (!entry) {
      cli.abortError(`Unknown doctype: ${doctype}`)
    }

    if (entry.role === DoctypeRole.Managed && !project.currentSubcontext) {
      cli.abortError(
        `Doctype "${doctype}" requires a subcontext. Use "mcm sub switch" to select one.`,
      )
    }

    const title = titleWords.join(" ")
    const slug = slugify(title)
    const target = resolveNewFileTarget(project, entry, doctype, slug)

    const rawProperties =
      entry.defaultProperties !== undefined
        ? entry.defaultProperties
        : BUILT_IN_DEFAULT_PROPERTIES

    const context = {
      date: new Date().toISOString().slice(0, 10),
      title,
      slug,
      doctype,
    }

    let properties = applyTemplates(rawProperties, context) as Record<
      string,
      unknown
    >

    if (Object.keys(properties).length === 0) {
      if (target.warnOnEmptyProperties) {
        cli.warning(
          `No frontmatter properties configured for doctype "${doctype}". Adding "title" to avoid breaking markdown handlers.`,
        )
      }
      properties = { title }
    }

    const markdownBody = `# ${title}\n`
    writeFileSyncOrAbort(
      target.filePath,
      prependFrontmatter(properties, markdownBody),
    )

    target.afterWrite?.()

    cli.writeln(toDisplayPath(target.filePath, process.cwd()))

    if (argv.flags?.open) {
      const editor = resolveEditor()
      if (editor) {
        spawnSync(editor, [target.filePath], { stdio: "inherit" })
      }
    }
  },
)

/**
 * Create a new file in a doctype directory. The filename is generated
 * from the title and the doctype's sequencing rules.
 *
 * ## Examples
 *
 * ```sh
 * mcm new devlogs "Add authentication"
 * mcm new features "add auth"
 * ```
 */
export function commentDoc() {}
