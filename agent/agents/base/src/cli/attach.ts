import type { CliOutput } from "./program.ts";

export async function reportAttach(attach: () => Promise<string>, output: CliOutput): Promise<void> {
  try {
    output.err(await attach());
  } catch (error) {
    output.err(`warning: could not open a session: ${error instanceof Error ? error.message : String(error)}`);
  }
}
