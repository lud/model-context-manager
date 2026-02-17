import type { Command } from "commander";
import * as p from "@clack/prompts";
import ansis from "ansis";

export type Language = "english" | "french";
export type Color = "red" | "blue";

export interface Prompts {
  intro(title: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  select<T>(opts: {
    message: string;
    options: { value: T; label?: string; hint?: string; disabled?: boolean }[];
  }): Promise<T | symbol>;
  text(opts: { message: string; validate?: (value?: string) => string | undefined }): Promise<string | symbol>;
  isCancel(value: unknown): value is symbol;
}

const defaultPrompts: Prompts = p;

export function greet(name: string, language: Language): string {
  return language === "french" ? `Bonjour ${name}` : `Hello ${name}`;
}

export function colorize(text: string, color: Color): string {
  return color === "red" ? ansis.red(text) : ansis.blue(text);
}

export async function run(prompts: Prompts = defaultPrompts) {
  prompts.intro("Welcome to the greeting demo!");

  const language = await prompts.select<Language>({
    message: "Pick a language",
    options: [
      { value: "english", label: "English" },
      { value: "french", label: "French" },
    ],
  });

  if (prompts.isCancel(language)) {
    prompts.cancel("Cancelled.");
    process.exit(0);
  }

  const color = await prompts.select<Color>({
    message: "Pick a color",
    options: [
      { value: "red", label: "Red" },
      { value: "blue", label: "Blue" },
    ],
  });

  if (prompts.isCancel(color)) {
    prompts.cancel("Cancelled.");
    process.exit(0);
  }

  const name = await prompts.text({
    message: "What is your name?",
    validate: (value = "") => {
      if (!value.trim()) return "Name is required";
    },
  });

  if (prompts.isCancel(name)) {
    prompts.cancel("Cancelled.");
    process.exit(0);
  }

  const greeting = greet(name, language);
  prompts.outro(colorize(greeting, color));
}

export function register(program: Command) {
  program
    .command("demo")
    .description("Interactive greeting demo")
    .action(() => run());
}
