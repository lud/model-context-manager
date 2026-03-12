import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { Project } from "ts-morph"
import yaml from "yaml"
import { abortError, warning } from "../src/lib/cli"

const ROOT = join(import.meta.dirname, "..")
const SRC_COMMANDS = join(ROOT, "src/commands")
const SITE_DIR = join(ROOT, "site")
const SITE_COMMANDS = join(SITE_DIR, "commands")
const SITE_PAGES = join(SITE_DIR, "pages")
const SITE_ASSETS = join(SITE_DIR, "assets")
const SCHEMA_SRC = join(ROOT, "resources/mcm-project.schema.json")

const COMMAND_ORDER = ["list", "new", "next", "which"]
const IGNORE_COMMANDS: string[] = []
const PAGE_ORDER: string[] = []

// --- Helpers ---

function extractCommentDoc(project: Project, filePath: string): string | null {
  const sourceFile = project.addSourceFileAtPath(filePath)
  const fn = sourceFile.getFunction("commentDoc")
  if (!fn) return null
  const jsDocs = fn.getJsDocs()
  if (jsDocs.length === 0) return null
  const fullText = jsDocs[0].getFullText()
  return fullText
    .replace(/^\/\*\*\s*\n?/, "")
    .replace(/\s*\*\/\s*$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim()
}

function parseFrontmatter(content: string): {
  title?: string
  [key: string]: unknown
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  return yaml.parse(match[1]) ?? {}
}

// --- Command discovery ---

const commandFiles = readdirSync(SRC_COMMANDS)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => f.replace(/\.ts$/, ""))

const discoveredSet = new Set(commandFiles)
const orderedCommands: string[] = []

for (const name of COMMAND_ORDER) {
  if (!discoveredSet.has(name)) {
    abortError(
      `Error: ordered command "${name}" has no matching file in src/commands/`,
    )
  }
  orderedCommands.push(name)
}

for (const name of commandFiles) {
  if (!COMMAND_ORDER.includes(name) && !IGNORE_COMMANDS.includes(name)) {
    warning(
      `Warning: discovered command "${name}" not in COMMAND_ORDER, appending`,
    )

    orderedCommands.push(name)
  }
}

// --- ts-morph project ---

const project = new Project({ tsConfigFilePath: join(ROOT, "tsconfig.json") })

// --- Process commands ---

// Clean generated directories
rmSync(SITE_COMMANDS, { recursive: true, force: true })
rmSync(SITE_ASSETS, { recursive: true, force: true })
mkdirSync(SITE_COMMANDS, { recursive: true })
mkdirSync(SITE_ASSETS, { recursive: true })

type CommandEntry = {
  slug: string
  title: string
  description: string
  commentDoc: string | null
}
const commandIndex: CommandEntry[] = []

for (const name of orderedCommands) {
  const filePath = join(SRC_COMMANDS, `${name}.ts`)
  const mod = await import(filePath)

  // Find the *Command export
  const commandExport = Object.entries(mod).find(
    ([key, val]) =>
      key.endsWith("Command") &&
      val != null &&
      typeof val === "object" &&
      "options" in (val as Record<string, unknown>),
  )

  if (!commandExport) {
    abortError(`Error: no *Command export found in ${name}.ts`)
  }

  const cmd = commandExport[1] as {
    options: {
      name: string
      parameters?: string[]
      help?: { description?: string }
    }
  }

  const cmdName = cmd.options.name
  const description = cmd.options.help?.description ?? ""
  const parameters = cmd.options.parameters ?? []
  const title = `mcm ${cmdName}`

  // Usage line
  const usageParts = ["mcm", cmdName, ...parameters]
  const usageLine = usageParts.join(" ")

  // Extract commentDoc
  const commentDoc = extractCommentDoc(project, filePath)

  // Build markdown
  const frontmatter = yaml.stringify({ title, description }).trim()
  let md = `---\n${frontmatter}\n---\n\n# ${title}\n\n${description}\n\n## Usage\n\n\`\`\`\n${usageLine}\n\`\`\`\n`

  if (commentDoc) {
    md += `\n${commentDoc}\n`
  }

  writeFileSync(join(SITE_COMMANDS, `${name}.md`), md)
  commandIndex.push({ slug: name, title, description, commentDoc })
  console.log(`  commands/${name}.md`)
}

// --- Page discovery ---

type PageEntry = { slug: string; title: string; description: string | null }
const pageIndex: PageEntry[] = []

if (existsSync(SITE_PAGES)) {
  const pageFiles = readdirSync(SITE_PAGES)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))

  const discoveredPages = new Set(pageFiles)
  const orderedPages: string[] = []

  for (const name of PAGE_ORDER) {
    if (!discoveredPages.has(name)) {
      abortError(
        `Error: ordered page "${name}" has no matching file in site/pages/`,
      )
    }
    orderedPages.push(name)
  }

  for (const name of pageFiles) {
    if (!PAGE_ORDER.includes(name)) {
      warning(`Warning: discovered page "${name}" not in PAGE_ORDER, appending`)
      orderedPages.push(name)
    }
  }

  for (const name of orderedPages) {
    const content = readFileSync(join(SITE_PAGES, `${name}.md`), "utf-8")
    const fm = parseFrontmatter(content)
    const title = (fm.title as string) ?? name
    const description = (fm.description as string) ?? null
    pageIndex.push({ slug: name, title, description })
    console.log(`  pages/${name}`)
  }
} else {
  warning("Warning: site/pages/ directory not found, skipping pages")
}

// --- index.json ---

const index = { commands: commandIndex, pages: pageIndex }
writeFileSync(
  join(SITE_DIR, "index.json"),
  JSON.stringify(index, null, 2) + "\n",
)
console.log("  index.json")

// --- Copy schema ---

copyFileSync(SCHEMA_SRC, join(SITE_ASSETS, "mcm-project.schema.json"))
console.log("  assets/mcm-project.schema.json")

console.log(`\nSite built successfully.`)
