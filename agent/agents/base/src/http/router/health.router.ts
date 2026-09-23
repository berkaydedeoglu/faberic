import { Elysia } from "elysia";

export function healthRouter() {
  return new Elysia().get("/health", () => ({ status: "ok" }));
}
