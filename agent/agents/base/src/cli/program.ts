import { Command, CommanderError } from "commander";
import { THINKING_LEVELS } from "../models/index.ts";
import type { ServeOptions } from "../http/server.ts";
import { ValidationError } from "../utils/errors/app.errors.ts";
import type { CreateSessionInput, ListModelsInput, ListSessionsInput } from "../dto/session.dto.ts";
import type { SessionCliHandler } from "./handlers/session.handler.ts";

export interface CliOutput {
  out(text: string): void;
  err(text: string): void;
}

export interface ProgramDeps {
  session: SessionCliHandler;
  serve: (options: ServeOptions) => void;
  defaults: ServeOptions;
  output: CliOutput;
}

function describeSessionCommands(session: Command): string {
  const help = session.createHelp();
  const rows = session.commands.flatMap((command) => [
    [["session", command.name(), command.usage().replace("[options]", "")].join(" ").replace(/\s+/g, " ").trim(), command.description()],
    ...help
      .visibleOptions(command)
      .filter((option) => option.long !== "--help")
      .map((option) => [`  ${option.flags}`, option.description]),
  ]);
  const width = Math.max(...rows.map(([term]) => term!.length));
  const lines = rows.map(([term, description]) => `  ${term!.padEnd(width)}  ${description}`.trimEnd());
  return `\nSession commands:\n${lines.join("\n")}\n\nRun "session <command> --help" for details on a single command.`;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new ValidationError(`Invalid port: "${value}"`);
  }
  return port;
}

export function createProgram({ session, serve, defaults, output }: ProgramDeps): Command {
  const print = async (result: string | Promise<string>) => output.out(await result);

  const program = new Command("agent")
    .description("pi.dev coding agent — CLI and HTTP API")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => output.out(text.trimEnd()),
      writeErr: (text) => output.err(text.trimEnd()),
    });

  program
    .command("serve")
    .description("start the HTTP API")
    .option("--port <port>", "port to listen on", String(defaults.port))
    .option("--host <host>", "host to bind", defaults.host)
    .action((options: { port: string; host: string }) => {
      const port = parsePort(options.port);
      serve({ port, host: options.host });
      output.out(`listening on http://${options.host}:${port}`);
    });

  const sessionCommand = program.command("session").description("manage the agent session");

  sessionCommand
    .command("create")
    .description("create the session")
    .option("--provider <provider>", "provider id (default: PI_DEFAULT_PROVIDER)")
    .option("--model <model>", "model id (default: PI_DEFAULT_MODEL)")
    .option("--thinking-level <level>", `one of ${THINKING_LEVELS.join(", ")} (default: PI_DEFAULT_THINKING_LEVEL)`)
    .option("--cwd <cwd>", "working directory for the agent (default: current directory)")
    .option("--force", "replace the active session")
    .action((options: CreateSessionInput) => print(session.create(options)));

  sessionCommand
    .command("list")
    .description("list stored pi sessions (current directory by default)")
    .option("--cwd <cwd>", "list sessions of another directory")
    .option("--all", "list sessions of every directory")
    .action((options: ListSessionsInput) => print(session.list(options)));

  sessionCommand
    .command("continue")
    .description("resume a stored pi session by id")
    .argument("<sessionId>")
    .option("--cwd <cwd>", "directory the session belongs to")
    .option("--force", "replace the active session")
    .action((sessionId: string, options: { cwd?: string; force?: boolean }) =>
      print(session.continue({ sessionId, ...options })),
    );

  sessionCommand.command("get").description("show the active session").action(() => print(session.get()));
  sessionCommand.command("abort").description("abort the running operation").action(() => print(session.abort()));
  sessionCommand.command("destroy").description("abort and dispose the session").action(() => print(session.destroy()));

  sessionCommand.command("get-model").description("show the active model").action(() => print(session.getModel()));
  sessionCommand
    .command("set-model")
    .description("switch the model")
    .argument("<provider>")
    .argument("<model>")
    .action((provider: string, model: string) => print(session.setModel(provider, model)));
  sessionCommand
    .command("list-models")
    .description("list models usable with the configured credentials")
    .option("--provider <provider>", "only this provider's models")
    .action((options: ListModelsInput) => print(session.listModels(options)));

  sessionCommand
    .command("get-thinking-level")
    .description("show the thinking level and what the model supports")
    .action(() => print(session.getThinkingLevel()));
  sessionCommand
    .command("set-thinking-level")
    .description("set the thinking level")
    .argument("<level>")
    .action((level: string) => print(session.setThinkingLevel(level)));

  sessionCommand.command("stats").description("show session stats").action(() => print(session.getStats()));
  sessionCommand.command("messages").description("show session messages").action(() => print(session.getMessages()));

  sessionCommand
    .command("prompt")
    .description("send a prompt and print the reply")
    .argument("<text...>")
    .action((words: string[]) => print(session.prompt(words)));
  sessionCommand
    .command("follow-up")
    .description("send a follow-up and print the reply")
    .argument("<text...>")
    .action((words: string[]) => print(session.followUp(words)));

  program.addHelpText("after", () => describeSessionCommands(sessionCommand));

  return program;
}

export async function executeCli(program: Command, argv: string[], output: CliOutput): Promise<number> {
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    output.err(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
