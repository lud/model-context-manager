# MCM

MCM is a file management CLI tool. It helps users organize and access files by doctype (a named category with an associated directory).

## Project structure

```
src/
  main.ts                   # Entry point — registers commands with cleye
  commands/                 # One file per command (+ matching .test.ts)
  lib/
    cli.ts                  # Output helpers (writeln, warning, error, etc.)
    config.ts               # Config loading and Zod schema
    config.test-helpers.ts  # mockConfig() helper for tests
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

## Config system (`src/lib/config.ts`)

- `.mcm.json` is located by walking up from CWD
- `getConfig()` — for use inside command handlers; locates and loads the config automatically
- `loadConfigOrFail(filePath)` — loads a specific file; resolves relative `dir` values in doctypes to absolute paths
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

- `vi.mock("../lib/config.js")` + `mockConfig()` from `config.test-helpers.ts` to inject config
- `vi.mock("../lib/cli.js")` to capture output calls in day-to-day command tests
- `vi.mock("@clack/prompts")` for interactive command tests

**Abort mocking:** When testing commands that use `abortError`/`abort`, the mock must throw to stop execution:

```typescript
vi.mocked(cli.abortError).mockImplementation(() => { throw new Error("abortError") })
vi.mocked(cli.abort).mockImplementation(() => { throw new Error("abort") })
```

**Fixtures** in `test/fixtures/` are real files on disk. Prefer them over mocking `fs` or creating tmp directories.

