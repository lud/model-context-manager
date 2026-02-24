import { afterEach, describe, expect, it, vi } from "vitest"
import * as cli from "../lib/cli.js"
import { whichCommand } from "./which.js"
import { mockConfig } from "../lib/config.test-helpers.js"

vi.mock("../lib/cli.js")
vi.mock("../lib/config.js")

afterEach(() => {
  vi.resetAllMocks()
})

describe("whichCommand", () => {
  it("outputs the configFile path", () => {
    mockConfig({ configFile: "/home/user/project/.mcm.json" })

    whichCommand.callback!({ _: {} })

    expect(cli.writeln).toHaveBeenCalledWith("/home/user/project/.mcm.json")
  })
})
