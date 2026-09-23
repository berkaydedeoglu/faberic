import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { healthRouter } from "../../../src/http/router/health.router.ts";

describe("healthRouter", () => {
  it("GET /health returns ok, with no DI dependencies", async () => {
    const app = new Elysia().use(healthRouter());
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
