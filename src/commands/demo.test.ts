import { describe, expect, it, vi } from "vitest";
import { greet, colorize, run, type Prompts } from "./demo.js";
import ansis from "ansis";

describe("greet", () => {
  it("greets in english", () => {
    expect(greet("Alice", "english")).toBe("Hello Alice");
  });

  it("greets in french", () => {
    expect(greet("Alice", "french")).toBe("Bonjour Alice");
  });
});

describe("colorize", () => {
  it("colorizes in red", () => {
    expect(colorize("hello", "red")).toBe(ansis.red("hello"));
  });

  it("colorizes in blue", () => {
    expect(colorize("hello", "blue")).toBe(ansis.blue("hello"));
  });
});

function stubPrompts(answers: { language: string; color: string; name: string }): Prompts {
  const selectAnswers = [answers.language, answers.color];
  let selectCall = 0;

  return {
    intro: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    select: vi.fn(async () => selectAnswers[selectCall++]) as Prompts["select"],
    text: vi.fn(async () => answers.name) as Prompts["text"],
    isCancel: ((_value: unknown): _value is symbol => false) as Prompts["isCancel"],
  };
}

describe("run", () => {
  it("displays a french greeting in red", async () => {
    const prompts = stubPrompts({ language: "french", color: "red", name: "Alice" });

    await run(prompts);

    expect(prompts.intro).toHaveBeenCalledWith("Welcome to the greeting demo!");
    expect(prompts.outro).toHaveBeenCalledWith(ansis.red("Bonjour Alice"));
  });

  it("displays an english greeting in blue", async () => {
    const prompts = stubPrompts({ language: "english", color: "blue", name: "Bob" });

    await run(prompts);

    expect(prompts.outro).toHaveBeenCalledWith(ansis.blue("Hello Bob"));
  });

  it("exits on cancel during language selection", async () => {
    const cancelSymbol = Symbol("cancel");
    const prompts = stubPrompts({ language: "english", color: "red", name: "Alice" });
    prompts.select = vi.fn(async () => cancelSymbol);
    prompts.isCancel = (value): value is symbol => value === cancelSymbol;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await run(prompts);

    expect(prompts.cancel).toHaveBeenCalledWith("Cancelled.");
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });
});
