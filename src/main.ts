import { Command } from "commander";
import { register as demo } from "./commands/demo.js";

const program = new Command();

program
  .name("mcm")
  .version("0.1.0")
  .description("A general-purpose CLI for file management and project utilities");

demo(program);

program.parse();
