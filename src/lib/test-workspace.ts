import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterAll } from "vitest"

/**
 * Create a temporary workspace directory for tests that need to mutate files.
 * Registers an `afterAll` hook to clean up automatically.
 *
 * Use `workspace.copyFixture(srcDir)` to get a mutable copy of a fixture
 * directory. Each call returns a unique path.
 */
export function createTestWorkspace(label: string) {
  const root = mkdtempSync(join(tmpdir(), `mcm-test-${label}-`))
  let counter = 0

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  return {
    /** The root temporary directory path. */
    root,

    /** Create an empty unique subdirectory inside the workspace. */
    dir(name?: string): string {
      const dirName = name ?? `dir-${++counter}`
      const path = join(root, dirName)
      mkdirSync(path, { recursive: true })
      return path
    },

    /**
     * Copy a fixture directory into the workspace, returning the path
     * to the mutable copy.
     */
    copyFixture(srcDir: string, name?: string): string {
      const dirName = name ?? `fixture-${++counter}`
      const dest = join(root, dirName)
      cpSync(srcDir, dest, { recursive: true })
      return dest
    },
  }
}
