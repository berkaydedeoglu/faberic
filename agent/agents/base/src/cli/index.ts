import { ConfigService } from "../config/config.service.ts";
import { buildContainer } from "../container.ts";
import { EnvironmentController } from "../controllers/environment.controller.ts";
import { SessionController } from "../controllers/session.controller.ts";
import { EnvironmentHttpHandler } from "../http/handlers/environment.handler.ts";
import { MonitoringHttpHandler } from "../http/handlers/monitoring.handler.ts";
import { SessionHttpHandler } from "../http/handlers/session.handler.ts";
import { startServer } from "../http/server.ts";
import { EventManager } from "../services/event/event-manager.service.ts";
import { LoggerService } from "../services/log/logger.service.ts";
import { reportAttach } from "./attach.ts";
import { EnvironmentCliHandler } from "./handlers/environment.handler.ts";
import { MonitoringCliHandler } from "./handlers/monitoring.handler.ts";
import { SessionCliHandler } from "./handlers/session.handler.ts";
import { reportPreflight } from "./preflight.ts";
import { type CliOutput, createProgram, executeCli } from "./program.ts";
import { startRepl } from "./repl.ts";
import { stopEvents } from "./shutdown.ts";

const consoleOutput: CliOutput = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
};

export async function runCli(argv: string[]): Promise<void> {
  const container = buildContainer();
  const defaults = container.resolve(ConfigService).get().server;
  const controller = container.resolve(SessionController);
  const sessionHandler = container.resolve(SessionCliHandler);
  const environmentHandler = container.resolve(EnvironmentCliHandler);
  const eventManager = container.resolve(EventManager);
  let serving = false;

  const exit = async (code: number) => {
    await stopEvents(() => eventManager.stop(), consoleOutput);
    await container.resolve(LoggerService).close();
    process.exit(code);
  };

  // Sessions run in the workspace, so it has to exist before anything else happens.
  await container.resolve(EnvironmentController).ensureWorkspace();
  await reportPreflight(() => controller.preflight(), consoleOutput);

  const execute = (args: string[]) =>
    executeCli(
      createProgram({
        session: sessionHandler,
        environment: environmentHandler,
        monitoring: container.resolve(MonitoringCliHandler),
        serve: (options) => {
          serving = true;
          startServer(
            {
              session: container.resolve(SessionHttpHandler),
              environment: container.resolve(EnvironmentHttpHandler),
              monitoring: container.resolve(MonitoringHttpHandler),
            },
            container.resolve(LoggerService),
            options,
          );
          process.once("SIGINT", () => void exit(0));
          process.once("SIGTERM", () => void exit(0));
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
    if (!serving) await exit(0);
    return;
  }

  const exitCode = await execute(argv);
  if (!serving) await exit(exitCode);
}
