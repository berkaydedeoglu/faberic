import { createInterface } from "node:readline";

export function tokenize(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3] ?? "");
}

export async function startRepl(
  execute: (argv: string[]) => Promise<number>,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const rl = createInterface({ input, output, prompt: "agent> " });
  output.write('Type "help" for commands, "exit" to quit.\n');
  rl.prompt();
  for await (const line of rl) {
    const argv = tokenize(line);
    if (argv[0] === "exit" || argv[0] === "quit") break;
    if (argv.length > 0) await execute(argv);
    rl.prompt();
  }
  rl.close();
}
