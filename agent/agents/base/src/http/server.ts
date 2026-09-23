import { Elysia } from "elysia";
import { ConflictError, NotFoundError, UnavailableError, ValidationError } from "../utils/errors/app.errors.ts";
import type { SessionHttpHandler } from "./handlers/session.handler.ts";
import { healthRouter } from "./router/health.router.ts";
import { sessionRouter } from "./router/session.router.ts";

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

export function createApp(sessionHandler: SessionHttpHandler) {
  return new Elysia()
    .onError(({ code, error, set }) => {
      set.status = statusOf(error, code);
      return {
        error: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      };
    })
    .use(healthRouter())
    .use(sessionRouter(sessionHandler));
}

export function startServer(sessionHandler: SessionHttpHandler, { port, host }: ServeOptions) {
  return createApp(sessionHandler).listen({ port, hostname: host });
}

export type App = ReturnType<typeof createApp>;
