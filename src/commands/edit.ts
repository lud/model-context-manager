import { command } from "cleye"
import * as cli from "../lib/cli.js"
import { readFileSyncOrAbort, writeFileSyncOrAbort } from "../lib/fs.js"
import { setFrontmatterProperty } from "../lib/frontmatter.js"
import { getProject } from "../lib/project.js"
import { toDisplayPath } from "../lib/paths.js"
import { resolveFileArg } from "../lib/resolve-file.js"

type FrontmatterUpdate = { key: string; value: string }

function parseSet(input: string): FrontmatterUpdate {
  const idx = input.indexOf(":")
  if (idx === -1)
    cli.abortError(`Invalid --set format (expected key:value): ${input}`)

  return {
    key: input.slice(0, idx),
    value: input.slice(idx + 1),
  }
}

function resolveUpdates(flags?: {
  set?: string[]
  setStatus?: string
}): FrontmatterUpdate[] {
  const updates = (flags?.set ?? []).map(parseSet)

  // Apply --set-status last so it deterministically overrides any status set via --set.
  if (flags?.setStatus !== undefined) {
    updates.push({ key: "status", value: flags.setStatus })
  }

  return updates
}

export const editCommand = command(
  {
    name: "edit",
    parameters: ["<pathOrDoctype>", "[id]"],
    help: { description: "Edit frontmatter properties in a file" },
    flags: {
      set: {
        type: [String],
        description: "Set a frontmatter property (key:value, repeatable)",
      },
      setStatus: {
        type: String,
        description: "Set status (shorthand for --set status:value)",
      },
      sub: {
        type: String,
        description: "Use a specific subcontext",
      },
    },
  },
  (argv) => {
    const project = getProject({ sub: argv.flags.sub })
    const args: [string, string] | [string] = argv._.id
      ? [argv._.pathOrDoctype, argv._.id]
      : [argv._.pathOrDoctype]
    const filePath = resolveFileArg(project, args, process.cwd())
    const updates = resolveUpdates(argv.flags)

    if (updates.length === 0) {
      cli.abortError(
        "No updates provided. Use --set key:value or --set-status value",
      )
    }

    let content = readFileSyncOrAbort(filePath, "utf-8")
    for (const update of updates) {
      content = setFrontmatterProperty(content, update.key, update.value)
    }

    writeFileSyncOrAbort(filePath, content)
    cli.writeln(toDisplayPath(filePath, process.cwd()))
  },
)

/**
 * Edit frontmatter fields in a file.
 *
 * ## Examples
 *
 * ```sh
 * mcm edit notes 1 --set status:specified
 * mcm edit notes/001.note.md --set owner:alice --set-status done
 * ```
 */
export function commentDoc() {}
