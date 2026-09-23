import type { CliOutput } from "./program.ts";

export async function stopEvents(stop: () => Promise<void>, output: CliOutput): Promise<void> {
  try {
    await stop();
  } catch (error) {
    output.err(`warning: could not send pending events: ${error instanceof Error ? error.message : String(error)}`);
  }
}
