import { afterEach, describe, expect, it, vi } from "vitest"
import * as cli from "../lib/cli.js"
import { whichCommand } from "./which.js"
import { mockProject } from "../lib/project.test-helpers.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/project.js")

afterEach(() => {
  vi.resetAllMocks()
})

describe("whichCommand", () => {
  it("outputs the projectFile path", () => {
    mockProject({ projectFile: "/home/user/project/.mcm.json" })

    whichCommand.callback!({ _: {} })

    expect(cli.writeln).toHaveBeenCalledWith("/home/user/project/.mcm.json")
  })
})
