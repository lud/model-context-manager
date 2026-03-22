# PM — Project Management CLI

PM is a file-based project management tool for software developers. It organizes documentation files (features, specs, tasks, etc.) into a configurable hierarchy, with metadata as the source of truth.

Designed for solo developers working with AI coding assistants. No accounts, no servers — just files.

## Core concepts

### Documents

A document is a markdown file with YAML frontmatter. Every document has a globally unique numeric ID (the filename prefix). IDs are assigned sequentially across all doctypes.

Filename format: `{ID}.{tag}.{slug}.md`

The ID is an integer. The zero-padded representation (e.g. `001`) is only for filesystem sorting — `001`, `1`, and `0001` all refer to the same document. Commands that accept a document reference accept any integer with any number of leading zeroes. The zero-padding width is determined by the doctype's mask (default `"000"` = 3 digits).

Examples:
- `001.feat.user-auth.md`
- `002.spec.login-flow.md`
- `003.task.add-jwt-middleware.md`

### Doctypes

A doctype defines a category of document. Each doctype has:

| Field             | Required | Default    | Description                                                             |
| ----------------- | -------- | ---------- | ----------------------------------------------------------------------- |
| `tag`             | yes      | —          | Short label used in filenames (e.g. `feat`, `spec`)                     |
| `dir`             | yes*     | `"."`      | Base directory relative to parent's self directory                      |
| `parent`          | no       | —          | Parent doctype name. Absent = top-level doctype                         |
| `requireParent`   | no       | `true`     | When `parent` is set, whether a parent document is required at creation |
| `intermediateDir` | no       | `false`    | Whether this doctype's documents create their own directory             |
| `closedStatuses`  | no       | `["done"]` | List of statuses that mean "no more work needed here"                   |
| `defaultStatus`   | no       | `"new"`    | Status assigned to new documents                                        |

*`dir` is required for top-level doctypes (no `parent`). Defaults to `"."` for child doctypes.

Statuses are free-form strings. Only `closedStatuses` are validated — everything else is accepted.

### Hierarchy

Parent-child relationships are stored in document frontmatter, not in config. The config defines which doctype *can* have a parent of which type; the frontmatter records the actual link.

```yaml
---
id: 3
parent: 2
status: new
title: Add JWT middleware
---
```

A document's parent must be of the doctype specified in the child's doctype config. For example, if `task.parent = "spec"`, then a task's `parent` field must reference a spec document.

### Directory layout

A document's location on disk is determined by:

1. Find the parent document (or project root if no parent).
2. Resolve the parent's **self directory**:
   - If the parent's doctype has `intermediateDir: true`, self directory is the parent's own directory (e.g. `context/features/001.feat.user-auth/`).
   - If `intermediateDir: false`, self directory is the parent's containing directory.
   - If no parent, self directory is the project root.
3. Append the doctype's `dir` to get the target directory.
4. Place the file in that directory.

Documents with `intermediateDir: true` also have an eponymous file inside their directory:
`001.feat.user-auth/001.feat.user-auth.md`

#### Example: flat children

```
feature:  intermediateDir: true,  dir: "context/features"
spec:     intermediateDir: false, dir: ".", parent: "feature"
task:     intermediateDir: false, dir: ".", parent: "spec"
```

```
context/features/
  001.feat.user-auth/
    001.feat.user-auth.md
    002.spec.login-flow.md
    003.task.add-jwt-middleware.md
    004.task.add-session-store.md
    005.spec.password-reset.md
    006.task.reset-email-template.md
```

#### Example: nested children

```
feature:  intermediateDir: true,  dir: "context/features"
spec:     intermediateDir: true,  dir: ".", parent: "feature"
task:     intermediateDir: false, dir: ".", parent: "spec"
```

```
context/features/
  001.feat.user-auth/
    001.feat.user-auth.md
    002.spec.login-flow/
      002.spec.login-flow.md
      003.task.add-jwt-middleware.md
      004.task.add-session-store.md
    005.spec.password-reset/
      005.spec.password-reset.md
      006.task.reset-email-template.md
```

### Global IDs

IDs are unique across all doctypes. To determine the next ID, scan all document files and take `max + 1`. An index cache may be introduced later (`~/.config/pm/projects/{project-hash}/index.json`) with mtime-based invalidation against `.pm.current`.

### File scanning

Document discovery uses a **generator function** (`function*`) to avoid loading all files into memory at once. Commands consume the generator lazily — e.g. `read 5` stops after finding the matching ID.

**V1 (simple):** Walk all directories belonging to doctypes that have no parent. Recursively scan subdirectories. For each `.md` file, parse the filename to extract ID and tag. Yield a document entry (ID, tag, slug, path) for files whose tag matches a known doctype.

**Future (smart):** Use the doctype config to navigate the hierarchy. For example, to find tasks: read config to learn tasks belong to specs, specs belong to features, features have `intermediateDir: true` and `dir: "context/features"`. Start at `<project>/context/features/`, list directories matching `*.feat.*`, then scan within each for files matching `*.task.*`. This avoids scanning unrelated directories entirely.

The generator yields lightweight entries (path, parsed filename components). Frontmatter is only read when needed by the caller (e.g. for status filtering or parent resolution).

### Current document

The current document is tracked in `.pm.current` in the project root. This file contains a single document ID.

- Gitignored by default: each worktree gets its own current document.
- Users who want to share it across machines can track it in git.
- Touched after each operation (for future index cache invalidation).

## Configuration

### Project file: `.pm.json`

Located at the project root. Discovered by walking up from CWD.

```json
{
  "doctypes": {
    "feature": {
      "dir": "context/features"
    }
  }
}
```

### Default doctypes

The following doctypes are built-in. User config is deep-merged on top:

```json
{
  "feature": {
    "tag": "feat",
    "intermediateDir": true,
    "closedStatuses": ["done"]
  },
  "spec": {
    "tag": "spec",
    "dir": ".",
    "parent": "feature",
    "closedStatuses": ["specified"]
  },
  "task": {
    "tag": "task",
    "dir": ".",
    "parent": "spec",
    "closedStatuses": ["done"]
  }
}
```

### Merge semantics

User config is deep-merged on top of defaults (e.g. using lodash `merge`). The merged result is validated against the Zod schema.

- **Object values**: deep-merged recursively (user fields override defaults per-key).
- **Array values**: replaced entirely (user's array wins).
- **Primitive values**: replaced.

**Special case**: setting a doctype to `null` removes it from the defaults. `{"doctypes": {"task": null}}` deletes the built-in task doctype. This null-removal is handled before the deep merge, at the doctype level only.

A minimal `.pm.json` only needs to set `dir` on the root doctype:

```json
{
  "doctypes": {
    "feature": {
      "dir": "context/features"
    }
  }
}
```

This gives you `feature`, `spec`, and `task` with all defaults applied.

### JSON Schema

A JSON Schema file is generated from the Zod schema via `z.toJSONSchema()` and written to `resources/pm-project.schema.json`. This file is published via jsdelivr (from the GitHub repo) so editors can provide autocomplete and validation.

The `init` command includes a `$schema` property in `.pm.json` pointing to the jsdelivr URL. The `$schema` field is stripped during project loading (passthrough in Zod).

A `tools/build-json-schema.ts` script generates the schema file. Run it after any schema change.

### Validation

After merging defaults and user config:

- Every doctype with a `parent` must reference an existing doctype.
- Every top-level doctype (no `parent`) must have an explicit `dir`.
- No circular parent references.
- All `tag` values must be unique across doctypes.
- `dir` must be a relative path (no absolute paths, no `..`).

## Commands

### `pm new <doctype> <title> [-p <id>] [-e] [-s <status>]`

Create a new document.

- Assigns the next global ID.
- If the doctype has a required parent and `-p` is not given, error.
- If the doctype has an optional parent, `-p` is optional.
- If the doctype has no parent config, `-p` is an error.
- `-e` opens the file in editor after creation. Finds the editor in `$PM_EDITOR`, fallback to `$EDITOR`, fallback to warning message display.
- `-s` sets an initial status (overrides `defaultStatus`).
- Creates intermediate directories as needed.
- Outputs the created file path.

### `pm list [-t <doctype>] [-p <id>] [--open] [--closed] [--status <status>]`

List documents.

- No arguments: list all open documents.
- `-t <doctype>`: filter by doctype.
- `-p <id>`: filter to descendants of the given document (children, grandchildren, etc.).
- `--open`: documents not in a closed status (default).
- `--closed`: documents in a closed status.
- `--status <status>`: documents with this exact status.
- Without `--open`, `--closed`, or `--status`: defaults to `--open`.

Output: one file per line, showing ID, tag, title, and status.

### `pm read <id>`

Print the full contents of a document to stdout.

### `pm edit <id> <key>:<value> [<key>:<value> ...]`

Update frontmatter properties. Special handling:

- `status:<value>` updates the status.
- `parent:<id>` updates the parent reference (validated against doctype config).
- `-p <id>` shorthand for `parent:<id>`.

### `pm done <id>`

Set the document's status to the first entry in its doctype's `closedStatuses`.

### `pm current [<id>]`

- Without argument: display the current document and its full hierarchy (ancestors and children at each level with statuses).
- With argument: set the current document and display the hierarchy.

### `pm status`

Project overview:

- Count of open/closed documents per doctype.
- If a current document is set: display the full hierarchy with titles and statuses.

### `pm tidy [-f]`

Reconcile filesystem with metadata. Dry-run by default, `-f` to apply.

- **Renumber**: fix ID gaps (reassign IDs sequentially, update all `parent` references).
- **Relocate**: move files to their correct directory based on current doctype config and parent relationships.
- **Orphans**: documents with a `parent` field referencing a non-existent ID. Prompt for a new parent or remove the link.
- **Rename**: update filenames to match current tag/slug conventions.

### `pm init`

Interactive setup. Creates `.pm.json`, adds `.pm.current` to `.gitignore`.

### `pm which`

Print the path to `.pm.json`.

## Frontmatter

Default frontmatter template for new documents:

```yaml
---
id: {id}
parent: {parentId}
title: {title}
status: {defaultStatus}
created_on: {date}
---
```

`parent` is omitted for top-level documents. Additional fields from `defaultProperties` (if added later) would be merged in.

## Technology

- **Language**: TypeScript
- **Runtime**: Node.js
- **CLI framework**: cleye
- **Testing**: vitest
- **Schema validation**: zod

## Conventions

### Two kinds of commands

**Interactive commands** (e.g. `init`) guide the user through a workflow. These may use `@clack/prompts` for prompts, spinners, and styled output.

**Day-to-day commands** (e.g. `list`, `read`, `status`) are meant to be used in scripts, piped output, or called by LLMs/agents. These must use the output module (`src/lib/cli.ts`) for all output — no `@clack/prompts`, no `console.log`.

### Output module (`src/lib/cli.ts`)

All day-to-day command output goes through these helpers:

| Function         | Behavior                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `write(text)`    | stdout, no newline                                                 |
| `writeln(text)`  | stdout + newline                                                   |
| `info(text)`     | alias for `writeln`                                                |
| `warning(text)`  | yellow text                                                        |
| `error(message)` | red text; accepts `string` or `{ message: string }` (e.g. `Error`) |
| `debug(text)`    | cyan text                                                          |
| `success(text)`  | green text                                                         |

### Path display

Paths printed by commands are relative to CWD when the path is a child of CWD, otherwise absolute.

### File system helpers (`src/lib/fs.ts`)

Wrappers around `node:fs` that turn filesystem errors into human-readable (and agent-readable) error messages, then exit the command cleanly via `abortError`. Commands should use these instead of calling `node:fs` directly.

| Function                           | Wraps           |
| ---------------------------------- | --------------- |
| `mkdirSyncOrAbort(path, opts)`     | `mkdirSync`     |
| `readdirSyncOrAbort(path)`         | `readdirSync`   |
| `readFileSyncOrAbort(path)`        | `readFileSync`  |
| `writeFileSyncOrAbort(path, data)` | `writeFileSync` |

Other filesystem operations should follow the same pattern.

### Testing

- **Framework**: vitest. Every command and lib module should have a matching `.test.ts`.
- **Commands are tested by calling exported functions directly**, not by spawning a subprocess.
- **Mocking**: `vi.mock("../lib/project.js")` + a `mockProject()` helper to inject project state. `vi.mock("../lib/cli.js")` to capture output in day-to-day command tests. `vi.mock("@clack/prompts")` for interactive commands.
- **Abort mocking**: mocks for `abortError`/`abort` must throw to stop execution in tests.
- **Fixtures**: real files in `test/fixtures/`. Prefer over mocking `fs`.
- **Mutable fixtures**: when tests need to write/rename/delete files, use `createTestWorkspace(label)` which copies fixtures into `/tmp` and cleans up automatically via `afterAll`.

### Project structure

```
src/
  main.ts                   # Entry point — registers commands with cleye
  commands/                 # One file per command (+ matching .test.ts)
  lib/
    cli.ts                  # Output helpers
    fs.ts                   # Filesystem wrappers with abort-on-error
    project.ts              # Project loading and Zod schema
    project.test-helpers.ts # mockProject() helper for tests
test/
  fixtures/                 # Real files used by tests
```

## Future considerations

- **Index cache**: `~/.config/pm/projects/{project-hash}/index.json` for fast ID lookup without scanning. Invalidated by mtime comparison with `.pm.current`.
- **Hooks**: shell commands triggered on events (post-create, post-done, etc.). Language-agnostic, configured in `.pm.json`.
- **Templates**: per-doctype markdown templates for new documents.
- **`pm next`**: print the next filename without creating (for scripting).
