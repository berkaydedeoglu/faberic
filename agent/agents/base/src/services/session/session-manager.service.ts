import { inject, singleton } from "tsyringe";
import type { ContinueSessionOptions, CreateSessionOptions } from "../../models/index.ts";
import { type PiSessionHandle, PiSessionClient, type SessionSdk } from "../../utils/clients/pi/client.ts";
import { NoActiveSessionError, SessionAlreadyActiveError } from "../../utils/errors/session.errors.ts";

@singleton()
export class SessionManagerService {
  private current: PiSessionHandle | undefined;

  constructor(@inject(PiSessionClient) private readonly sdk: SessionSdk) {}

  hasActiveSession(): boolean {
    return this.current !== undefined;
  }

  getActiveSession(): PiSessionHandle {
    if (!this.current) {
      throw new NoActiveSessionError();
    }
    return this.current;
  }

  createSession(options: CreateSessionOptions, force = false): Promise<PiSessionHandle> {
    return this.activate(() => this.sdk.createSession(options), force);
  }

  async continueSession(options: ContinueSessionOptions, force = false): Promise<PiSessionHandle> {
    if (this.current?.id === options.sessionId) {
      return this.current;
    }
    return this.activate(() => this.sdk.continueSession(options), force);
  }

  private async activate(open: () => Promise<PiSessionHandle>, force: boolean): Promise<PiSessionHandle> {
    const previous = this.current;
    if (previous && !force) {
      throw new SessionAlreadyActiveError(previous.id);
    }
    const next = await open();
    if (previous) {
      await this.sdk.abortSession(previous);
      this.sdk.disposeSession(previous);
    }
    this.current = next;
    return next;
  }

  async abortActiveSession(): Promise<void> {
    await this.sdk.abortSession(this.getActiveSession());
  }

  async destroyActiveSession(): Promise<void> {
    if (!this.current) return;
    await this.sdk.abortSession(this.current);
    this.sdk.disposeSession(this.current);
    this.current = undefined;
  }
}
