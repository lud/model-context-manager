import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { toDisplayPath } from "./paths.js"

describe("toDisplayPath", () => {
  it("returns relative path when path is under cwd", () => {
    const cwd = "/home/user/project"
    const abs = join(cwd, "foo", "bar.md")
    expect(toDisplayPath(abs, cwd)).toBe(join("foo", "bar.md"))
  })

  it("returns absolute path when path is outside cwd", () => {
    const cwd = "/home/user/project"
    const abs = "/some/completely/other/path.md"
    expect(toDisplayPath(abs, cwd)).toBe(abs)
  })

  it("returns '.' when path equals cwd", () => {
    const cwd = "/home/user/project"
    expect(toDisplayPath(cwd, cwd)).toBe(".")
  })
})
