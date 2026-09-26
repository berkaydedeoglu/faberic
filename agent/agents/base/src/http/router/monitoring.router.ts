import { Elysia } from "elysia";
import type { MonitoringHttpHandler } from "../handlers/monitoring.handler.ts";

export function monitoringRouter(handler: MonitoringHttpHandler) {
  return new Elysia({ prefix: "/monitoring" })
    .get("/sessions", () => handler.getSessions())
    .get("/events", () => handler.getEventStats())
    .get("/errors", () => handler.getErrors());
}
