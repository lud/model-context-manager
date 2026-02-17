import * as p from "@clack/prompts";
import ansis from "ansis";

export async function run() {
  p.intro("Welcome to the greeting demo!");

  const language = await p.select({
    message: "Pick a language",
    options: [
      { value: "english", label: "English" },
      { value: "french", label: "French" },
    ],
  });

  if (p.isCancel(language)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const color = await p.select({
    message: "Pick a color",
    options: [
      { value: "red", label: "Red" },
      { value: "blue", label: "Blue" },
    ],
  });

  if (p.isCancel(color)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const name = await p.text({
    message: "What is your name?",
    validate: (value = "") => {
      if (!value.trim()) return "Name is required";
    },
  });

  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const greeting = language === "french" ? `Bonjour ${name}` : `Hello ${name}`;
  const colorize = color === "red" ? ansis.red : ansis.blue;

  p.outro(colorize(greeting));
}
