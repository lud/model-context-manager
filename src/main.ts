import { Command } from "commander";

const program = new Command();

program
  .name("mcm")
  .version("0.1.0")
  .description("A general-purpose CLI for file management and project utilities");

program
  .command("demo")
  .description("Interactive greeting demo")
  .action(async () => {
    const { run } = await import("./commands/demo.js");
    await run();
  });

program.parse();
