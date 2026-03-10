import { describe, expect, it } from "vitest"
import {
  applyTemplates,
  formatFrontmatter,
  hasFrontmatter,
  parseFrontmatter,
  prependFrontmatter,
  setFrontmatterProperty,
} from "./frontmatter.js"

describe("parseFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const content = "---\ntitle: Hello\nstatus: open\n---\nBody text\n"
    const { data, body } = parseFrontmatter(content)
    expect(data).toEqual({ title: "Hello", status: "open" })
    expect(body).toBe("Body text\n")
  })

  it("returns empty data and full content when no frontmatter", () => {
    const content = "# Just a heading\n"
    const { data, body } = parseFrontmatter(content)
    expect(data).toEqual({})
    expect(body).toBe(content)
  })

  it("returns empty data when unclosed frontmatter", () => {
    const content = "---\ntitle: Hello\n"
    const { data, body } = parseFrontmatter(content)
    expect(data).toEqual({})
    expect(body).toBe(content)
  })

  it("parses empty frontmatter block", () => {
    const content = "---\n---\nBody\n"
    const { data, body } = parseFrontmatter(content)
    expect(data).toEqual({})
    expect(body).toBe("Body\n")
  })

  it("parses nested and array values", () => {
    const content = "---\ntags:\n  - a\n  - b\nmeta:\n  x: 1\n---\n"
    const { data } = parseFrontmatter(content)
    expect(data).toEqual({ tags: ["a", "b"], meta: { x: 1 } })
  })
})

describe("hasFrontmatter", () => {
  it("returns true when content starts with frontmatter", () => {
    expect(hasFrontmatter("---\nfoo: bar\n---\nbody")).toBe(true)
  })

  it("returns false when content has no frontmatter", () => {
    expect(hasFrontmatter("# Heading\n")).toBe(false)
  })
})

describe("formatFrontmatter", () => {
  it("formats a basic object", () => {
    const result = formatFrontmatter({ title: "Hello", status: "open" })
    expect(result).toContain("---\n")
    expect(result).toContain("title: Hello")
    expect(result).toContain("status: open")
    expect(result).toMatch(/---\n$/)
  })

  it("formats empty object", () => {
    const result = formatFrontmatter({})
    expect(result).toBe("---\n{}\n---\n")
  })
})

describe("prependFrontmatter", () => {
  it("concatenates frontmatter and body", () => {
    const result = prependFrontmatter({ status: "open" }, "# Title\n")
    expect(result).toMatch(/^---\n/)
    expect(result).toContain("status: open")
    expect(result).toContain("---\n# Title\n")
  })
})

describe("applyTemplates", () => {
  it("replaces known tokens in strings", () => {
    expect(applyTemplates("{{date}}", { date: "2026-03-10" })).toBe(
      "2026-03-10",
    )
  })

  it("leaves unknown tokens as-is", () => {
    expect(applyTemplates("{{unknown}}", {})).toBe("{{unknown}}")
  })

  it("walks nested objects", () => {
    const result = applyTemplates(
      { created_on: "{{date}}", meta: { slug: "{{slug}}" } },
      { date: "2026-03-10", slug: "hello" },
    )
    expect(result).toEqual({
      created_on: "2026-03-10",
      meta: { slug: "hello" },
    })
  })

  it("walks arrays", () => {
    const result = applyTemplates(["{{date}}", "static"], { date: "2026-03-10" })
    expect(result).toEqual(["2026-03-10", "static"])
  })

  it("passes through non-string scalars", () => {
    expect(applyTemplates(42, {})).toBe(42)
    expect(applyTemplates(true, {})).toBe(true)
    expect(applyTemplates(null, {})).toBe(null)
  })
})

describe("setFrontmatterProperty", () => {
  it("adds a new key to existing frontmatter", () => {
    const content = "---\ntitle: Hello\n---\nBody\n"
    const result = setFrontmatterProperty(content, "status", "closed")
    const { data, body } = parseFrontmatter(result)
    expect(data).toEqual({ title: "Hello", status: "closed" })
    expect(body).toBe("Body\n")
  })

  it("updates an existing key", () => {
    const content = "---\nstatus: open\n---\nBody\n"
    const result = setFrontmatterProperty(content, "status", "closed")
    const { data } = parseFrontmatter(result)
    expect(data.status).toBe("closed")
  })

  it("adds frontmatter when none exists", () => {
    const content = "# Heading\n"
    const result = setFrontmatterProperty(content, "status", "closed")
    const { data, body } = parseFrontmatter(result)
    expect(data).toEqual({ status: "closed" })
    expect(body).toBe("# Heading\n")
  })
})
