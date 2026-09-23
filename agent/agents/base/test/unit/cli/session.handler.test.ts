import { beforeEach, describe, expect, it } from "bun:test";
import { SessionCliHandler } from "../../../src/cli/handlers/session.handler.ts";
import type { SessionController } from "../../../src/controllers/session.controller.ts";
import {
  NoActiveSessionError,
  SessionAlreadyActiveError,
  SessionNotFoundError,
} from "../../../src/utils/errors/session.errors.ts";
import { createMockedSessionStack, type MockSessionSdk } from "../../mocks/session-sdk.mock.ts";

describe("SessionCliHandler", () => {
  let sdk: MockSessionSdk;
  let controller: SessionController;
  let handler: SessionCliHandler;

  beforeEach(() => {
    ({ sdk, controller } = createMockedSessionStack());
    handler = new SessionCliHandler(controller);
  });

  async function storeSession(input: { cwd?: string } = {}, modifiedAt?: number): Promise<string> {
    const { id } = JSON.parse(await handler.create(input));
    await handler.prompt(["remember", "me"]);
    await handler.destroy();
    if (modifiedAt !== undefined) sdk.stored.get(id)!.modifiedAt = modifiedAt;
    return id;
  }

  describe("attach", () => {
    it("creates a session when none is stored for this directory", async () => {
      const message = await handler.attach();
      const { id } = controller.getSession();
      expect(message).toBe(`Created session ${id}.`);
    });

    it("resumes the most recently modified session of this directory", async () => {
      const older = await storeSession({}, 1_000);
      const newer = await storeSession({}, 2_000);
      expect(older).not.toBe(newer);

      expect(await handler.attach()).toBe(
        `Resumed session ${newer} (2 messages). Use "session create --force" to start a new one.`,
      );
      expect(controller.getSession().id).toBe(newer);
    });

    it("ignores sessions stored for other directories", async () => {
      const elsewhere = await storeSession({ cwd: "/elsewhere" });
      expect(await handler.attach()).toStartWith("Created session");
      expect(controller.getSession().id).not.toBe(elsewhere);
    });

    it("keeps an already active session", async () => {
      const { id } = JSON.parse(await handler.create({}));
      expect(await handler.attach()).toBe(`Using session ${id}.`);
      expect(sdk.sessions.size).toBe(1);
    });
  });

  describe("commands that need a session attach on first use", () => {
    it("creates a session for the first prompt and keeps using it", async () => {
      expect(await handler.prompt(["hello", "there"])).toBe("echo: hello there");
      const { id } = JSON.parse(await handler.get());
      expect(await handler.followUp(["more"])).toBe("echo: more");
      expect(JSON.parse(await handler.get()).id).toBe(id);
      expect((await handler.getMessages()).split("\n")).toHaveLength(4);
    });

    it("resumes the stored conversation instead of starting over", async () => {
      await storeSession();
      expect(await handler.getMessages()).toBe("[user] remember me\n[assistant] echo: remember me");
    });

    it("applies to model, thinking level, and stats commands", async () => {
      expect(JSON.parse(await handler.getModel()).id).toBe("claude-sonnet-4-5");
      await handler.destroy();
      expect(JSON.parse(await handler.setModel("openai", "gpt-5")).id).toBe("gpt-5");
      await handler.destroy();
      expect(JSON.parse(await handler.getThinkingLevel()).thinkingLevel).toBe("medium");
      await handler.destroy();
      expect(JSON.parse(await handler.setThinkingLevel("high")).thinkingLevel).toBe("high");
      await handler.destroy();
      expect(JSON.parse(await handler.getStats()).totalMessages).toBe(0);
    });
  });

  describe("commands that manage sessions explicitly do not attach", () => {
    it("abort and destroy report that there is no session", async () => {
      await expect(handler.abort()).rejects.toThrow(NoActiveSessionError);
      await expect(handler.destroy()).rejects.toThrow(NoActiveSessionError);
      expect(sdk.sessions.size).toBe(0);
    });

    it("list and list-models leave the process without a session", async () => {
      expect(await handler.list({})).toBe("No sessions found.");
      expect(await handler.listModels({ provider: "openai" })).toBe("openai/gpt-5  GPT-5");
      expect(controller.hasActiveSession()).toBe(false);
    });

    it("create after attaching needs --force, like any second session", async () => {
      await handler.attach();
      await expect(handler.create({})).rejects.toThrow(SessionAlreadyActiveError);
      expect(JSON.parse(await handler.create({ force: true })).id).toBe(controller.getSession().id);
    });

    it("continue resumes a specific session and reports unknown ids", async () => {
      const id = await storeSession();
      expect(JSON.parse(await handler.continue({ sessionId: id })).id).toBe(id);
      await expect(handler.continue({ sessionId: "missing", force: true })).rejects.toThrow(SessionNotFoundError);
    });
  });
});
