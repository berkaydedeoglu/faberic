import { Command, CommanderError } from "commander";
import { THINKING_LEVELS } from "../models/index.ts";
import type { ServeOptions } from "../http/server.ts";
import { ValidationError } from "../utils/errors/app.errors.ts";
import type { CreateSessionInput, ListModelsInput } from "../dto/session.dto.ts";
import type { ContentOptions, EnvironmentCliHandler } from "./handlers/environment.handler.ts";
import type { MonitoringCliHandler } from "./handlers/monitoring.handler.ts";
import type { SessionCliHandler } from "./handlers/session.handler.ts";

export interface CliOutput {
  out(text: string): void;
  err(text: string): void;
}

export interface ProgramDeps {
  session: SessionCliHandler;
  environment: EnvironmentCliHandler;
  monitoring: MonitoringCliHandler;
  serve: (options: ServeOptions) => void;
  defaults: ServeOptions;
  output: CliOutput;
}

function describeCommands(group: Command): string {
  const help = group.createHelp();
  const rows = group.commands.flatMap((command) => [
    [[group.name(), command.name(), command.usage().replace("[options]", "")].join(" ").replace(/\s+/g, " ").trim(), command.description()],
    ...help
      .visibleOptions(command)
      .filter((option) => option.long !== "--help")
      .map((option) => [`  ${option.flags}`, option.description]),
  ]);
  const width = Math.max(...rows.map(([term]) => term!.length));
  const lines = rows.map(([term, description]) => `  ${term!.padEnd(width)}  ${description}`.trimEnd());
  const title = `${group.name()[0]!.toUpperCase()}${group.name().slice(1)}`;
  return `\n${title} commands:\n${lines.join("\n")}\n\nRun "${group.name()} <command> --help" for details on a single command.`;
}

interface Target {
  session?: string;
}

function targeted(command: Command): Command {
  return command.option("--session <sessionId>", "open session to act on (default: the default session)");
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new ValidationError(`Invalid port: "${value}"`);
  }
  return port;
}

function withContent(command: Command): Command {
  return command
    .argument("[content...]", "file content (or use --file)")
    .option("--file <path>", "read the content from a file");
}

export function createProgram({ session, environment, monitoring, serve, defaults, output }: ProgramDeps): Command {
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

  const sessionCommand = program.command("session").description("manage agent sessions");

  sessionCommand
    .command("create")
    .description("open a new session")
    .option("--provider <provider>", "provider id (default: PI_DEFAULT_PROVIDER)")
    .option("--model <model>", "model id (default: PI_DEFAULT_MODEL)")
    .option("--thinking-level <level>", `one of ${THINKING_LEVELS.join(", ")} (default: PI_DEFAULT_THINKING_LEVEL)`)
    .action((options: CreateSessionInput) => print(session.create(options)));

  sessionCommand
    .command("list")
    .description("list stored pi sessions of the workspace")
    .action(() => print(session.list()));

  sessionCommand
    .command("continue")
    .description("resume a stored pi session by id")
    .argument("<sessionId>")
    .action((sessionId: string) => print(session.continue({ sessionId })));

  sessionCommand
    .command("list-open")
    .description("list the sessions open in this process")
    .action(() => print(session.listOpen()));
  sessionCommand
    .command("set-default")
    .description("make an open session the default for commands without --session")
    .argument("<sessionId>")
    .action((sessionId: string) => print(session.setDefault(sessionId)));

  targeted(sessionCommand.command("get").description("show a session"))
    .action((options: Target) => print(session.get(options.session)));
  targeted(sessionCommand.command("abort").description("abort the running operation"))
    .action((options: Target) => print(session.abort(options.session)));
  targeted(sessionCommand.command("destroy").description("abort and close a session"))
    .action((options: Target) => print(session.destroy(options.session)));

  targeted(sessionCommand.command("get-model").description("show the model"))
    .action((options: Target) => print(session.getModel(options.session)));
  targeted(sessionCommand.command("set-model").description("switch the model").argument("<provider>").argument("<model>"))
    .action((provider: string, model: string, options: Target) => print(session.setModel(provider, model, options.session)));
  sessionCommand
    .command("list-models")
    .description("list models usable with the configured credentials")
    .option("--provider <provider>", "only this provider's models")
    .action((options: ListModelsInput) => print(session.listModels(options)));

  targeted(sessionCommand.command("get-thinking-level").description("show the thinking level and what the model supports"))
    .action((options: Target) => print(session.getThinkingLevel(options.session)));
  targeted(sessionCommand.command("set-thinking-level").description("set the thinking level").argument("<level>"))
    .action((level: string, options: Target) => print(session.setThinkingLevel(level, options.session)));

  targeted(sessionCommand.command("stats").description("show session stats"))
    .action((options: Target) => print(session.getStats(options.session)));
  targeted(sessionCommand.command("messages").description("show session messages"))
    .action((options: Target) => print(session.getMessages(options.session)));

  targeted(sessionCommand.command("prompt").description("send a prompt and print the reply").argument("<text...>"))
    .action((words: string[], options: Target) => print(session.prompt(words, options.session)));
  targeted(sessionCommand.command("follow-up").description("send a follow-up and print the reply").argument("<text...>"))
    .action((words: string[], options: Target) => print(session.followUp(words, options.session)));

  const environmentCommand = program.command("environment").description("prepare the workspace the agents run in");

  environmentCommand
    .command("clone")
    .description("git clone a repository into the workspace")
    .argument("<url>")
    .option("--directory <dir>", "folder inside the workspace (default: the repository name)")
    .option("--depth <depth>", "shallow clone with this many commits (default: full history)", (value) => Number(value))
    .action((url: string, options: { directory?: string; depth?: number }) => print(environment.clone({ url, ...options })));
  withContent(environmentCommand.command("create-agent-md").description("write AGENTS.md in the workspace"))
    .action((words: string[], options: ContentOptions) => print(environment.createAgentMd(words, options)));
  withContent(environmentCommand.command("inject-skill").description("write .pi/skills/<name>/SKILL.md in the workspace").argument("<name>"))
    .action((name: string, words: string[], options: ContentOptions) => print(environment.injectSkill(name, words, options)));

  const monitoringCommand = program.command("monitoring").description("inspect the runtime state of this process");

  monitoringCommand
    .command("sessions")
    .description("show every open session with its stats")
    .action(() => print(monitoring.sessions()));
  monitoringCommand
    .command("events")
    .description("show event counters and delivery state")
    .action(() => print(monitoring.events()));
  monitoringCommand
    .command("errors")
    .description("show the tail of the error log")
    .action(() => print(monitoring.errors()));

  program.addHelpText("after", () =>
    [sessionCommand, environmentCommand, monitoringCommand].map(describeCommands).join("\n"),
  );

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
