import { inject, singleton } from "tsyringe";
import type { ContinueSessionOptions, CreateSessionOptions, EventObserver } from "../../models/index.ts";
import { type PiSessionHandle, PiSessionClient, type SessionSdk } from "../../utils/clients/pi/client.ts";
import { EventManager } from "../event/event-manager.service.ts";
import { NoActiveSessionError, SessionNotOpenError } from "../../utils/errors/session.errors.ts";

interface OpenSession {
  readonly handle: PiSessionHandle;
  readonly unsubscribe: () => void;
}

@singleton()
export class SessionManagerService {
  // Map keeps insertion order, so the first entry is the oldest open session.
  private readonly sessions = new Map<string, OpenSession>();
  // Unset (or closed) means the oldest open session is the default.
  private defaultId: string | undefined;

  constructor(
    @inject(PiSessionClient) private readonly sdk: SessionSdk,
    @inject(EventManager) private readonly observer: EventObserver,
  ) {}

  hasSessions(): boolean {
    return this.sessions.size > 0;
  }

  listSessions(): PiSessionHandle[] {
    return [...this.sessions.values()].map(({ handle }) => handle);
  }

  getDefaultSession(): PiSessionHandle {
    const chosen = this.defaultId === undefined ? undefined : this.sessions.get(this.defaultId);
    const [first] = this.sessions.values();
    const session = chosen ?? first;
    if (!session) {
      throw new NoActiveSessionError();
    }
    return session.handle;
  }

  setDefaultSession(sessionId: string): PiSessionHandle {
    const handle = this.getSession(sessionId);
    this.defaultId = handle.id;
    return handle;
  }

  /** The open session with this id, or the default session when no id is given. */
  getSession(sessionId?: string): PiSessionHandle {
    if (sessionId === undefined) {
      return this.getDefaultSession();
    }
    const open = this.sessions.get(sessionId);
    if (!open) {
      throw new SessionNotOpenError(sessionId);
    }
    return open.handle;
  }

  async createSession(options: CreateSessionOptions): Promise<PiSessionHandle> {
    return this.add(await this.sdk.createSession(options));
  }

  async continueSession(options: ContinueSessionOptions): Promise<PiSessionHandle> {
    const open = this.sessions.get(options.sessionId);
    if (open) {
      return open.handle;
    }
    return this.add(await this.sdk.continueSession(options));
  }

  async abortSession(sessionId?: string): Promise<PiSessionHandle> {
    const handle = this.getSession(sessionId);
    await this.sdk.abortSession(handle);
    return handle;
  }

  async destroySession(sessionId?: string): Promise<PiSessionHandle> {
    const handle = this.getSession(sessionId);
    await this.sdk.abortSession(handle);
    this.sessions.get(handle.id)?.unsubscribe();
    this.sdk.disposeSession(handle);
    this.sessions.delete(handle.id);
    if (this.defaultId === handle.id) {
      this.defaultId = undefined;
    }
    return handle;
  }

  private add(handle: PiSessionHandle): PiSessionHandle {
    this.sessions.set(handle.id, { handle, unsubscribe: this.sdk.subscribe(handle, this.observer) });
    return handle;
  }
}
