import { beforeEach, describe, expect, it } from "bun:test";
import type { SessionController } from "../../src/controllers/session.controller.ts";
import { NotFoundError, UnavailableError, ValidationError } from "../../src/utils/errors/app.errors.ts";
import {
  MissingCredentialsError,
  ModelNotSelectedError,
  NoActiveSessionError,
  SessionNotFoundError,
} from "../../src/utils/errors/session.errors.ts";
import { createMockedSessionStack, type MockSessionSdk } from "../mocks/session-sdk.mock.ts";

describe("SessionController", () => {
  let sdk: MockSessionSdk;
  let controller: SessionController;

  beforeEach(() => {
    ({ sdk, controller } = createMockedSessionStack());
  });

  describe("createSession", () => {
    it("returns a descriptor built from the created session", async () => {
      const session = await controller.createSession({ provider: "openai", model: "gpt-5", thinkingLevel: "low" });
      expect(session.status).toBe("idle");
      expect(session.model).toEqual({ provider: "openai", id: "gpt-5", name: "gpt-5" });
      expect(session.thinkingLevel).toBe("low");
    });

    it("keeps the createdAt of the session instead of the read time", async () => {
      const created = await controller.createSession({});
      await Bun.sleep(5);
      expect(controller.getSession().createdAt).toBe(created.createdAt);
    });

    it("rejects blank strings and unknown thinking levels", async () => {
      await expect(controller.createSession({ provider: "  " })).rejects.toThrow(ValidationError);
      await expect(controller.createSession({ model: 42 })).rejects.toThrow(ValidationError);
      await expect(controller.createSession({ thinkingLevel: "ultra" })).rejects.toThrow(ValidationError);
    });

    it("opens more sessions while the first one stays the default", async () => {
      const first = await controller.createSession({});
      const second = await controller.createSession({ provider: "openai", model: "gpt-5" });
      expect(controller.getSession().id).toBe(first.id);
      expect(controller.listOpenSessions().map((session) => session.id)).toEqual([first.id, second.id]);
      expect(controller.listOpenSessions()[1]?.model?.id).toBe("gpt-5");
    });
  });

  describe("without an active session", () => {
    it("throws NoActiveSessionError, which is a NotFoundError", () => {
      expect(() => controller.getSession()).toThrow(NoActiveSessionError);
      expect(() => controller.getModel()).toThrow(NotFoundError);
      expect(() => controller.getStats()).toThrow(NotFoundError);
    });

    it("still lists available models", async () => {
      expect(await controller.listAvailableModels({ provider: "openai" })).toEqual([
        { provider: "openai", id: "gpt-5", name: "GPT-5" },
      ]);
    });
  });

  describe("with an active session", () => {
    beforeEach(async () => {
      await controller.createSession({});
    });

    it("sets the model after validating input", async () => {
      await expect(controller.setModel({ provider: "openai" })).rejects.toThrow(ValidationError);
      expect(await controller.setModel({ provider: "openai", model: "gpt-5" })).toEqual({
        provider: "openai",
        id: "gpt-5",
        name: "gpt-5",
      });
      expect(controller.getModel().id).toBe("gpt-5");
    });

    it("reports the effective thinking level and what the model supports", () => {
      const session = sdk.sessions.values().next().value!;
      session.availableThinkingLevels = ["off", "low", "medium"];

      const state = controller.setThinkingLevel({ thinkingLevel: "max" });
      expect(state).toEqual({ thinkingLevel: "medium", available: ["off", "low", "medium"] });
      expect(controller.getThinkingLevel()).toEqual(state);
    });

    it("reports a session without a model as not found", () => {
      sdk.getModel = () => undefined;
      expect(() => controller.getModel()).toThrow(ModelNotSelectedError);
      expect(() => controller.getModel()).toThrow(NotFoundError);
    });

    it("refuses to switch to a provider without credentials", async () => {
      await expect(controller.setModel({ provider: "mistral", model: "mistral-large" })).rejects.toThrow(
        MissingCredentialsError,
      );
      expect(controller.getModel().provider).toBe("anthropic");
    });

    it("rejects an unknown thinking level", () => {
      expect(() => controller.setThinkingLevel({ thinkingLevel: "ultra" })).toThrow(ValidationError);
    });

    it("prompts and follows up, returning messages and stats", async () => {
      await expect(controller.prompt({ text: " " })).rejects.toThrow(ValidationError);

      const first = await controller.prompt({ text: "hi" });
      expect(first.messages.map((m) => m.text)).toEqual(["hi", "echo: hi"]);

      const second = await controller.followUp({ text: "again" });
      expect(second.stats.totalMessages).toBe(4);
      expect(controller.getMessages()).toHaveLength(4);
    });

    it("aborts without dropping the session, destroys it completely", async () => {
      const aborted = await controller.abortSession();
      expect(controller.getSession().id).toBe(aborted.id);

      expect(await controller.destroySession()).toEqual({ id: aborted.id, status: "disposed" });
      expect(() => controller.getSession()).toThrow(NoActiveSessionError);
    });

    it("destroys the default session and falls back to the next one", async () => {
      const first = controller.getSession();
      const second = await controller.createSession({});
      expect(await controller.destroySession()).toEqual({ id: first.id, status: "disposed" });
      expect(controller.getSession().id).toBe(second.id);
      expect(controller.listOpenSessions()).toHaveLength(1);
    });
  });

  describe("credentials", () => {
    it("passes preflight warnings through", async () => {
      sdk.preflightWarnings = ["no credentials"];
      expect(await controller.preflight()).toEqual(["no credentials"]);
    });

    it("refuses to prompt a provider without credentials, keeping the session usable", async () => {
      await controller.createSession({ provider: "mistral", model: "mistral-large" });

      await expect(controller.prompt({ text: "hi" })).rejects.toThrow(MissingCredentialsError);
      await expect(controller.followUp({ text: "hi" })).rejects.toThrow(UnavailableError);
      expect(controller.getMessages()).toEqual([]);

      await controller.setModel({ provider: "openai", model: "gpt-5" });
      expect((await controller.prompt({ text: "hi" })).messages).toHaveLength(2);
    });
  });

  describe("stored sessions", () => {
    async function storeSession(): Promise<string> {
      const { id } = await controller.createSession({});
      await controller.prompt({ text: "remember me" });
      await controller.destroySession();
      return id;
    }

    it("lists the stored sessions", async () => {
      const first = await storeSession();
      const second = await storeSession();
      expect((await controller.listSessions()).map((s) => s.id)).toEqual([first, second]);
    });

    it("does not store a session that never got a reply, like pi", async () => {
      const { id } = await controller.createSession({});
      await controller.destroySession();

      expect(await controller.listSessions()).toEqual([]);
      await expect(controller.continueSession({ sessionId: id })).rejects.toThrow(SessionNotFoundError);
    });

    it("reports message count and first message", async () => {
      await storeSession();
      const [session] = await controller.listSessions();
      expect(session?.messageCount).toBe(2);
      expect(session?.firstMessage).toBe("remember me");
    });

    it("continues a stored session with its history", async () => {
      const id = await storeSession();
      const continued = await controller.continueSession({ sessionId: id });

      expect(continued.id).toBe(id);
      expect(controller.getSession().id).toBe(id);
      expect(controller.getMessages().map((m) => m.text)).toEqual(["remember me", "echo: remember me"]);
    });

    it("validates the session id and reports unknown ones as not found", async () => {
      await expect(controller.continueSession({})).rejects.toThrow(ValidationError);
      await expect(controller.continueSession({ sessionId: "missing" })).rejects.toThrow(SessionNotFoundError);
      await expect(controller.continueSession({ sessionId: "missing" })).rejects.toThrow(NotFoundError);
    });

    it("opens the stored session next to the open ones", async () => {
      const id = await storeSession();
      const open = await controller.createSession({});

      expect((await controller.continueSession({ sessionId: id })).id).toBe(id);
      expect(controller.listOpenSessions().map((session) => session.id)).toEqual([open.id, id]);
      expect(controller.getSession().id).toBe(open.id);
    });
  });
});
