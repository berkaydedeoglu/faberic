import { Elysia } from "elysia";
import type { SessionHttpHandler } from "../handlers/session.handler.ts";

export function sessionRouter(handler: SessionHttpHandler) {
  return new Elysia({ prefix: "/session" })
    .post("/", (ctx) => handler.create(ctx))
    .get("/", (ctx) => handler.get(ctx))
    .get("/list", () => handler.list())
    .get("/open", () => handler.listOpen())
    .put("/default", (ctx) => handler.setDefault(ctx))
    .post("/continue", (ctx) => handler.continue(ctx))
    .post("/abort", (ctx) => handler.abort(ctx))
    .delete("/", (ctx) => handler.destroy(ctx))
    .get("/model", (ctx) => handler.getModel(ctx))
    .put("/model", (ctx) => handler.setModel(ctx))
    .get("/models", (ctx) => handler.listModels(ctx))
    .get("/thinking-level", (ctx) => handler.getThinkingLevel(ctx))
    .put("/thinking-level", (ctx) => handler.setThinkingLevel(ctx))
    .get("/stats", (ctx) => handler.getStats(ctx))
    .get("/messages", (ctx) => handler.getMessages(ctx))
    .post("/prompt", (ctx) => handler.prompt(ctx))
    .post("/follow-up", (ctx) => handler.followUp(ctx));
}
