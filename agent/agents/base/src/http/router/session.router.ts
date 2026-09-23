import { Elysia } from "elysia";
import type { SessionHttpHandler } from "../handlers/session.handler.ts";

export function sessionRouter(handler: SessionHttpHandler) {
  return new Elysia({ prefix: "/session" })
    .post("/", (ctx) => handler.create(ctx))
    .get("/", () => handler.get())
    .get("/list", (ctx) => handler.list(ctx))
    .post("/continue", (ctx) => handler.continue(ctx))
    .post("/abort", () => handler.abort())
    .delete("/", () => handler.destroy())
    .get("/model", () => handler.getModel())
    .put("/model", (ctx) => handler.setModel(ctx))
    .get("/models", (ctx) => handler.listModels(ctx))
    .get("/thinking-level", () => handler.getThinkingLevel())
    .put("/thinking-level", (ctx) => handler.setThinkingLevel(ctx))
    .get("/stats", () => handler.getStats())
    .get("/messages", () => handler.getMessages())
    .post("/prompt", (ctx) => handler.prompt(ctx))
    .post("/follow-up", (ctx) => handler.followUp(ctx));
}
