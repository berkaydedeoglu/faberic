import { Elysia } from "elysia";
import type { EnvironmentHttpHandler } from "../handlers/environment.handler.ts";

export function environmentRouter(handler: EnvironmentHttpHandler) {
  return new Elysia({ prefix: "/environment" })
    .post("/clone", (ctx) => handler.clone(ctx))
    .post("/agent-md", (ctx) => handler.createAgentMd(ctx))
    .post("/skills", (ctx) => handler.injectSkill(ctx));
}
