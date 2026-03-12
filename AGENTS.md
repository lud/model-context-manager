# MCM

MCM is a file management CLI tool. It helps users organize and access files by doctype (a named category with an associated directory).

## Project structure

```
src/
  main.ts                   # Entry point — registers commands with cleye
  commands/                 # One file per command (+ matching .test.ts)
  lib/
    cli.ts                  # Output helpers (writeln, warning, error, etc.)
    project.ts              # Project loading and Zod schema
    project.test-helpers.ts # mockProject() helper for tests
test/
  fixtures/                 # Real files used by tests — no tmp dirs, no mocking fs
```

## Commands

Commands are built with [cleye](https://github.com/privatenumber/cleye). Each command is a named export from `src/commands/<name>.ts` and registered in `src/main.ts`.

### Two kinds of commands

**Interactive commands** (e.g. `init`, `config`) guide the user through a workflow. These may use `@clack/prompts` for prompts, spinners, and styled output.

**Day-to-day commands** (e.g. `list`) are meant to be used in scripts, piped output, or called by LLMs. These must use `src/lib/cli.ts` for all output — no `@clack/prompts`, no `console.log`.

## Output module (`src/lib/cli.ts`)

Use these functions for all output in day-to-day commands:

| Function         | Output                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `write(text)`    | stdout, no newline                                                 |
| `writeln(text)`  | stdout + newline                                                   |
| `info(text)`     | alias for `writeln`                                                |
| `warning(text)`  | yellow text                                                        |
| `error(message)` | red text; accepts `string` or `{ message: string }` (e.g. `Error`) |
| `debug(text)`    | cyan text                                                          |
| `success(text)`  | green text                                                         |

## File system helpers (`src/lib/fs.ts`)

Use these wrappers instead of calling `node:fs` directly in commands. They call `abortError` with a human-readable message on failure.

| Function                           | Wraps           |
| ---------------------------------- | --------------- |
| `mkdirSyncOrAbort(path, opts)`     | `mkdirSync`     |
| `readdirSyncOrAbort(path)`         | `readdirSync`   |
| `readFileSyncOrAbort(path)`        | `readFileSync`  |
| `writeFileSyncOrAbort(path, data)` | `writeFileSync` |

Other filesystem operations should follow the same pattern. New additions should be referenced here.

## Doctype roles and dispatch pattern

Each doctype has a `role: "regular" | "subcontext" | "managed"` (type `DoctypeRole` from `project.ts`). Commands that branch on role should use a **switch statement dispatching to small specialized functions**, keeping shared logic in the command handler.

Pattern: define a plan/target type, then a dispatch function with a switch:

```typescript
// 1. Define a result type for role-specific logic
type SeqfixPlan = { displayLines: string[]; apply: () => void; successMessage: string }

// 2. Small specialized functions per role
function planSubcontextSeqfix(...): SeqfixPlan | null { ... }
function planManagedSeqfix(...): SeqfixPlan | null { ... }
function planRegularSeqfix(...): SeqfixPlan | null { ... }

// 3. Switch dispatch
function planSeqfix(project, entry, doctype): SeqfixPlan | null {
  switch (entry.role) {
    case "subcontext": return planSubcontextSeqfix(project, entry)
    case "managed":    return planManagedSeqfix(project, entry, doctype)
    case "regular":    return planRegularSeqfix(entry)
  }
}

// 4. Command handler uses the plan — shared logic stays here
const plan = planSeqfix(project, entry, doctype)
if (!plan) { cli.info("Nothing to rename."); return }
for (const line of plan.displayLines) cli.info(line)
if (!force) { cli.info("Run with -f to apply changes."); return }
plan.apply()
cli.success(plan.successMessage)
```

See `new.ts` (`NewFileTarget` + `resolveNewFileTarget`) and `seqfix.ts` (`SeqfixPlan` + `planSeqfix`) for real examples.

## Project system (`src/lib/project.ts`)

- `.mcm.json` is located by walking up from CWD
- `getProject()` — for use inside command handlers; locates and loads the project automatically
- `loadProjectOrFail(filePath)` — loads a specific file; resolves relative `dir` values in doctypes to absolute paths
- Schema is Zod-validated; unknown fields are stripped

## Testing

We use [vitest](https://vitest.dev/). Every command and lib module should have a matching `.test.ts`.

**Commands are tested by calling exported functions directly**, not by spawning a subprocess:

```typescript
// Test a command handler
command.callback!({ _: { someArg: "value" } })

// Test exported helpers directly
listAllDoctypes(doctypes)
```

**Mocking:**

- `vi.mock("../lib/project.js")` + `mockProject()` from `project.test-helpers.ts` to inject project
- `vi.mock("../lib/cli.js")` to capture output calls in day-to-day command tests
- `vi.mock("@clack/prompts")` for interactive command tests

**Abort mocking:** When testing commands that use `abortError`/`abort`, the mock must throw to stop execution:

```typescript
vi.mocked(cli.abortError).mockImplementation(() => { throw new Error("abortError") })
vi.mocked(cli.abort).mockImplementation(() => { throw new Error("abort") })
```

**Fixtures** in `test/fixtures/` are real files on disk. Prefer them over mocking `fs` or creating tmp directories.

**Mutable fixtures:** When tests need to rename, delete, or write files, use `createTestWorkspace(label)` from `src/lib/test-workspace.ts`:

```typescript
import { createTestWorkspace } from "../lib/test-workspace.js"

const workspace = createTestWorkspace("seqfix")

it("renames files", () => {
  const dir = workspace.copyFixture(fixtureDir)  // mutable copy
  // ... mutate files in dir ...
})
```

- `workspace.copyFixture(srcDir, name?)` — copies a fixture directory, returns mutable path
- `workspace.dir(name?)` — creates an empty directory
- Cleanup is automatic via `afterAll`

