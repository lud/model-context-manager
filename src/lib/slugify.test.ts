import { describe, expect, it } from "vitest"
import { slugify } from "./slugify.js"

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("My Cool Document")).toBe("my-cool-document")
  })

  it("strips accented characters", () => {
    expect(slugify("Café résumé")).toBe("cafe-resume")
  })

  it("preserves underscores", () => {
    expect(slugify("my_file name")).toBe("my_file-name")
  })

  it("collapses consecutive unsupported chars into one dash", () => {
    expect(slugify("hello!!!world")).toBe("hello-world")
  })

  it("trims leading and trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello")
  })

  it("handles numbers", () => {
    expect(slugify("Chapter 3 Notes")).toBe("chapter-3-notes")
  })

  it("handles empty string", () => {
    expect(slugify("")).toBe("")
  })

  it("handles string of only unsupported chars", () => {
    expect(slugify("!!!")).toBe("")
  })
})
