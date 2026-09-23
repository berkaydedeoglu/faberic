import { beforeEach, describe, expect, it } from "bun:test";
import { SessionManagerService } from "../../src/services/session/session-manager.service.ts";
import { NoActiveSessionError, SessionAlreadyActiveError } from "../../src/utils/errors/session.errors.ts";
import { MockSessionSdk } from "../mocks/session-sdk.mock.ts";

describe("SessionManagerService", () => {
  let mockSdk: MockSessionSdk;
  let manager: SessionManagerService;

  beforeEach(() => {
    mockSdk = new MockSessionSdk();
    manager = new SessionManagerService(mockSdk);
  });

  it("has no active session initially", () => {
    expect(manager.hasActiveSession()).toBe(false);
    expect(() => manager.getActiveSession()).toThrow(NoActiveSessionError);
  });

  it("creates and exposes exactly one session", async () => {
    const handle = await manager.createSession({});
    expect(manager.hasActiveSession()).toBe(true);
    expect(manager.getActiveSession()).toEqual(handle);
  });

  it("refuses to create a second session without force", async () => {
    await manager.createSession({});
    await expect(manager.createSession({})).rejects.toThrow(SessionAlreadyActiveError);
    expect(mockSdk.sessions.size).toBe(1);
  });

  it("replaces the active session when force is true", async () => {
    const first = await manager.createSession({});
    const second = await manager.createSession({}, true);
    expect(second.id).not.toBe(first.id);
    expect(mockSdk.sessions.size).toBe(1);
    expect(manager.getActiveSession()).toEqual(second);
  });

  it("destroys the active session, aborting and disposing it", async () => {
    const handle = await manager.createSession({});
    await manager.destroyActiveSession();
    expect(manager.hasActiveSession()).toBe(false);
    expect(mockSdk.sessions.has(handle.id)).toBe(false);
  });

  it("continues a stored session as the single active one", async () => {
    const stored = await manager.createSession({});
    await mockSdk.prompt(stored, "hi");
    await manager.destroyActiveSession();

    const continued = await manager.continueSession({ sessionId: stored.id });
    expect(continued.id).toBe(stored.id);
    expect(manager.getActiveSession()).toEqual(continued);

    const other = await manager.createSession({}, true);
    await expect(manager.continueSession({ sessionId: stored.id })).rejects.toThrow(SessionAlreadyActiveError);
    expect(manager.getActiveSession()).toEqual(other);
  });

  it("returns the active session when continuing the one already active", async () => {
    const active = await manager.createSession({});
    expect(await manager.continueSession({ sessionId: active.id })).toEqual(active);
    expect(mockSdk.sessions.size).toBe(1);
  });

  it("keeps the active session when a forced continue has nothing to open", async () => {
    const active = await manager.createSession({});
    await expect(manager.continueSession({ sessionId: "missing" }, true)).rejects.toThrow("missing");
    expect(manager.getActiveSession()).toEqual(active);
    expect(mockSdk.sessions.has(active.id)).toBe(true);
  });

  it("disposes the previous session only after the forced replacement opened", async () => {
    const first = await manager.createSession({});
    const second = await manager.createSession({}, true);
    expect(mockSdk.sessions.has(first.id)).toBe(false);
    expect(mockSdk.stored.get(first.id)?.disposed).toBe(true);
    expect(manager.getActiveSession()).toEqual(second);
  });
});
