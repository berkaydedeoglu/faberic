import type { CliOutput } from "./program.ts";

export async function reportPreflight(check: () => Promise<string[]>, output: CliOutput): Promise<void> {
  try {
    for (const warning of await check()) {
      output.err(`warning: ${warning}`);
    }
  } catch (error) {
    output.err(`warning: preflight check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
