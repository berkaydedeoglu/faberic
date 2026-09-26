import { Elysia } from "elysia";
import type { Logger } from "../models/index.ts";
import { ConflictError, NotFoundError, UnavailableError, ValidationError } from "../utils/errors/app.errors.ts";
import type { EnvironmentHttpHandler } from "./handlers/environment.handler.ts";
import type { MonitoringHttpHandler } from "./handlers/monitoring.handler.ts";
import type { SessionHttpHandler } from "./handlers/session.handler.ts";
import { environmentRouter } from "./router/environment.router.ts";
import { healthRouter } from "./router/health.router.ts";
import { monitoringRouter } from "./router/monitoring.router.ts";
import { sessionRouter } from "./router/session.router.ts";

export interface HttpHandlers {
  session: SessionHttpHandler;
  environment: EnvironmentHttpHandler;
  monitoring: MonitoringHttpHandler;
}

export interface ServeOptions {
  port: number;
  host: string;
}

function statusOf(error: unknown, code: string | number): number {
  if (error instanceof ValidationError || code === "PARSE") return 400;
  if (error instanceof NotFoundError || code === "NOT_FOUND") return 404;
  if (error instanceof ConflictError) return 409;
  if (error instanceof UnavailableError) return 503;
  return 500;
}

export function createApp(handlers: HttpHandlers, logger: Logger) {
  return new Elysia()
    .onError(({ code, error, set, request }) => {
      const status = statusOf(error, code);
      set.status = status;
      // Client mistakes are warnings; everything else is an error and shows up in /monitoring/errors.
      const failed = `${request.method} ${new URL(request.url).pathname} failed with ${status}`;
      if (status >= 500) logger.error(failed, error);
      else logger.warn(failed, error);
      return {
        error: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      };
    })
    .use(healthRouter())
    .use(sessionRouter(handlers.session))
    .use(environmentRouter(handlers.environment))
    .use(monitoringRouter(handlers.monitoring));
}

export function startServer(handlers: HttpHandlers, logger: Logger, { port, host }: ServeOptions) {
  return createApp(handlers, logger).listen({ port, hostname: host });
}

export type App = ReturnType<typeof createApp>;
