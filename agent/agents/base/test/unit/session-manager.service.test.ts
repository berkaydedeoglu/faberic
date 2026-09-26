import { beforeEach, describe, expect, it } from "bun:test";
import { SessionManagerService } from "../../src/services/session/session-manager.service.ts";
import { NoActiveSessionError, SessionNotOpenError } from "../../src/utils/errors/session.errors.ts";
import { MockSessionSdk, RecordingObserver } from "../mocks/session-sdk.mock.ts";

describe("SessionManagerService", () => {
  let mockSdk: MockSessionSdk;
  let manager: SessionManagerService;
  let observer: RecordingObserver;

  beforeEach(() => {
    mockSdk = new MockSessionSdk();
    observer = new RecordingObserver();
    manager = new SessionManagerService(mockSdk, observer);
  });

  it("has no sessions initially", () => {
    expect(manager.hasSessions()).toBe(false);
    expect(manager.listSessions()).toEqual([]);
    expect(() => manager.getDefaultSession()).toThrow(NoActiveSessionError);
  });

  it("creates a session and makes it the default", async () => {
    const handle = await manager.createSession({});
    expect(manager.hasSessions()).toBe(true);
    expect(manager.getDefaultSession()).toEqual(handle);
  });

  it("keeps several sessions open, the first one being the default", async () => {
    const first = await manager.createSession({});
    const second = await manager.createSession({});
    const third = await manager.createSession({});
    expect(manager.listSessions()).toEqual([first, second, third]);
    expect(manager.getDefaultSession()).toEqual(first);
    expect(mockSdk.sessions.size).toBe(3);
  });

  it("destroys the default session, aborting and disposing it, and promotes the next one", async () => {
    const first = await manager.createSession({});
    const second = await manager.createSession({});
    expect(await manager.destroySession()).toEqual(first);
    expect(mockSdk.stored.get(first.id)?.aborted).toBe(true);
    expect(mockSdk.sessions.has(first.id)).toBe(false);
    expect(manager.listSessions()).toEqual([second]);
    expect(manager.getDefaultSession()).toEqual(second);

    await manager.destroySession();
    expect(manager.hasSessions()).toBe(false);
    await expect(manager.destroySession()).rejects.toThrow(NoActiveSessionError);
  });

  it("aborts only the default session", async () => {
    const first = await manager.createSession({});
    const second = await manager.createSession({});
    await manager.abortSession();
    expect(mockSdk.stored.get(first.id)?.aborted).toBe(true);
    expect(mockSdk.stored.get(second.id)?.aborted).toBe(false);
  });

  it("continues a stored session next to the open ones", async () => {
    const stored = await manager.createSession({});
    await mockSdk.prompt(stored, "hi");
    await manager.destroySession();

    const other = await manager.createSession({});
    const continued = await manager.continueSession({ sessionId: stored.id });
    expect(continued.id).toBe(stored.id);
    expect(manager.listSessions()).toEqual([other, continued]);
  });

  it("returns the open session when continuing one that is already open", async () => {
    const open = await manager.createSession({});
    await mockSdk.prompt(open, "hi");
    expect(await manager.continueSession({ sessionId: open.id })).toEqual(open);
    expect(manager.listSessions()).toEqual([open]);
    expect(mockSdk.observers.get(open.id)?.size).toBe(1);
  });

  it("leaves the open sessions alone when a continue has nothing to open", async () => {
    const open = await manager.createSession({});
    await expect(manager.continueSession({ sessionId: "missing" })).rejects.toThrow("missing");
    expect(manager.listSessions()).toEqual([open]);
  });

  describe("targeting", () => {
    it("resolves an open session by id and the default one without an id", async () => {
      const first = await manager.createSession({});
      const second = await manager.createSession({});
      expect(manager.getSession(second.id)).toEqual(second);
      expect(manager.getSession()).toEqual(first);
      expect(() => manager.getSession("missing")).toThrow(SessionNotOpenError);
    });

    it("aborts and destroys the named session, leaving the default alone", async () => {
      const first = await manager.createSession({});
      const second = await manager.createSession({});
      await manager.abortSession(second.id);
      expect(mockSdk.stored.get(second.id)?.aborted).toBe(true);
      expect(mockSdk.stored.get(first.id)?.aborted).toBe(false);

      expect(await manager.destroySession(second.id)).toEqual(second);
      expect(manager.listSessions()).toEqual([first]);
      await expect(manager.destroySession(second.id)).rejects.toThrow(SessionNotOpenError);
    });

    it("uses the chosen default until it is destroyed, then the first open session again", async () => {
      const first = await manager.createSession({});
      const second = await manager.createSession({});
      const third = await manager.createSession({});

      expect(manager.setDefaultSession(third.id)).toEqual(third);
      expect(manager.getDefaultSession()).toEqual(third);
      await manager.createSession({});
      expect(manager.getDefaultSession()).toEqual(third);

      await manager.destroySession();
      expect(manager.getDefaultSession()).toEqual(first);
      await manager.destroySession(first.id);
      expect(manager.getDefaultSession()).toEqual(second);
    });

    it("refuses to make a session the default unless it is open", async () => {
      const open = await manager.createSession({});
      expect(() => manager.setDefaultSession("missing")).toThrow(SessionNotOpenError);
      expect(manager.getDefaultSession()).toEqual(open);
    });
  });

  describe("events", () => {
    const summary = () => observer.events.map(({ type, sessionId }) => ({ type, sessionId }));

    it("forwards agent_start and agent_end with the session id", async () => {
      const handle = await manager.createSession({});
      await mockSdk.prompt(handle, "hi");
      expect(summary()).toEqual([
        { type: "agent_start", sessionId: handle.id },
        { type: "agent_end", sessionId: handle.id },
      ]);
    });

    it("observes every open session, not just the default", async () => {
      const first = await manager.createSession({});
      const second = await manager.createSession({});
      await mockSdk.prompt(second, "hi");
      await mockSdk.prompt(first, "hi");
      expect(summary().map((event) => event.sessionId)).toEqual([second.id, second.id, first.id, first.id]);
    });

    it("stops observing a destroyed session", async () => {
      const handle = await manager.createSession({});
      await manager.createSession({});
      await manager.destroySession();
      expect(mockSdk.observers.get(handle.id)?.size).toBe(0);
    });

    it("observes a continued session", async () => {
      const stored = await manager.createSession({});
      await mockSdk.prompt(stored, "hi");
      await manager.destroySession();
      const continued = await manager.continueSession({ sessionId: stored.id });
      await mockSdk.prompt(continued, "again");
      expect(summary()).toHaveLength(4);
      expect(mockSdk.observers.get(stored.id)?.size).toBe(1);
    });
  });
});
