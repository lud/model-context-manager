import { command } from "cleye"
import * as p from "@clack/prompts"
import ansis from "ansis"
import { getConfig } from "../lib/config.js"

export type Language = "english" | "french"
export type Color = "red" | "blue"

export const demoCommand = command(
  {
    name: "demo",
    help: { description: "Interactive demo of prompts and styled output" },
    parameters: ["<first name>"],
    flags: {
      port: {
        type: Number,
        description: "port number",
        default: 80,
      },
    },
  },
  async (argv) => {
    const config = getConfig()

    p.intro("Welcome to the greeting demo!")
    p.log.info(`Config: extend = ${config.extend}`)

    const language = await p.select<Language>({
      message: "Pick a language",
      options: [
        { value: "english", label: "English" },
        { value: "french", label: "French" },
      ],
    })

    if (p.isCancel(language)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    const color = await p.select<Color>({
      message: "Pick a color",
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
      ],
    })

    if (p.isCancel(color)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    const name = await p.text({
      message: "What is your name?",
      validate: (value = "") => {
        if (!value.trim()) return "Name is required"
      },
    })

    if (p.isCancel(name)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    p.outro(colorize(greet(name, language), color))
    p.outro(colorize(greet(argv._.firstName, language), color))
  },
)

export function greet(name: string, language: Language): string {
  return language === "french" ? `Bonjour ${name}` : `Hello ${name}`
}

export function colorize(text: string, color: Color): string {
  return color === "red" ? ansis.red(text) : ansis.blue(text)
}
