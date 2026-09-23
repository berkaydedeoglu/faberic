import { ConfigService } from "../config/config.service.ts";
import { buildContainer } from "../container.ts";
import { SessionHttpHandler } from "../http/handlers/session.handler.ts";
import { startServer } from "../http/server.ts";
import { SessionController } from "../controllers/session.controller.ts";
import { SessionCliHandler } from "./handlers/session.handler.ts";
import { reportAttach } from "./attach.ts";
import { reportPreflight } from "./preflight.ts";
import { type CliOutput, createProgram, executeCli } from "./program.ts";
import { startRepl } from "./repl.ts";

const consoleOutput: CliOutput = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
};

export async function runCli(argv: string[]): Promise<void> {
  const container = buildContainer();
  const defaults = container.resolve(ConfigService).get().server;
  let serving = false;

  const controller = container.resolve(SessionController);
  const sessionHandler = container.resolve(SessionCliHandler);
  await reportPreflight(() => controller.preflight(), consoleOutput);

  const execute = (args: string[]) =>
    executeCli(
      createProgram({
        session: sessionHandler,
        serve: (options) => {
          serving = true;
          startServer(container.resolve(SessionHttpHandler), options);
        },
        defaults,
        output: consoleOutput,
      }),
      args,
      consoleOutput,
    );

  if (argv.length === 0) {
    await reportAttach(() => sessionHandler.attach(), consoleOutput);
    await startRepl(execute);
    if (!serving) process.exit(0);
    return;
  }

  const exitCode = await execute(argv);
  if (!serving) process.exit(exitCode);
}
