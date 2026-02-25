import { describe, expect, it, vi, beforeEach } from "vitest"
import * as p from "@clack/prompts"
import { greet, colorize, demoCommand } from "./demo.js"
import { mockProject } from "../lib/project.test-helpers.js"
import ansis from "ansis"

vi.mock("@clack/prompts")
vi.mock("../lib/project.js")

describe("greet", () => {
  it("greets in english", () => {
    expect(greet("Alice", "english")).toBe("Hello Alice")
  })

  it("greets in french", () => {
    expect(greet("Alice", "french")).toBe("Bonjour Alice")
  })
})

describe("colorize", () => {
  it("colorizes in red", () => {
    expect(colorize("hello", "red")).toBe(ansis.red("hello"))
  })

  it("colorizes in blue", () => {
    expect(colorize("hello", "blue")).toBe(ansis.blue("hello"))
  })
})

describe("demoCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockProject()
    vi.mocked(p.isCancel).mockReturnValue(false)
  })

  it("displays a french greeting in red", async () => {
    vi.mocked(p.select)
      .mockResolvedValueOnce("french")
      .mockResolvedValueOnce("red")
    vi.mocked(p.text).mockResolvedValueOnce("Alice")

    await demoCommand.callback!({ _: { firstName: "World" } })

    expect(p.intro).toHaveBeenCalledWith("Welcome to the greeting demo!")
    expect(p.outro).toHaveBeenNthCalledWith(1, ansis.red("Bonjour Alice"))
    expect(p.outro).toHaveBeenNthCalledWith(2, ansis.red("Bonjour World"))
  })

  it("displays an english greeting in blue", async () => {
    vi.mocked(p.select)
      .mockResolvedValueOnce("english")
      .mockResolvedValueOnce("blue")
    vi.mocked(p.text).mockResolvedValueOnce("Bob")

    await demoCommand.callback!({ _: { firstName: "Bob" } })

    expect(p.outro).toHaveBeenCalledWith(ansis.blue("Hello Bob"))
  })

  it("outputs the config extend value", async () => {
    mockProject({ extend: true })
    vi.mocked(p.select)
      .mockResolvedValueOnce("english")
      .mockResolvedValueOnce("blue")
    vi.mocked(p.text).mockResolvedValueOnce("Alice")

    await demoCommand.callback!({ _: { firstName: "Alice" } })

    expect(p.log.info).toHaveBeenCalledWith("Config: extend = true")
  })

  it("exits on cancel during language selection", async () => {
    const cancelSymbol = Symbol("cancel")
    vi.mocked(p.select).mockResolvedValueOnce(cancelSymbol)
    vi.mocked(p.isCancel).mockReturnValueOnce(true)

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)

    await demoCommand.callback!({ _: { firstName: "Alice" } })

    expect(p.cancel).toHaveBeenCalledWith("Cancelled.")
    expect(exitSpy).toHaveBeenCalledWith(0)

    exitSpy.mockRestore()
  })
})
