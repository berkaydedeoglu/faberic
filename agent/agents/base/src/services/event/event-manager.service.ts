import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../config/config.service.ts";
import type { AgentEvent } from "../../models/index.ts";
import { type EventSink, OrchestratorClient } from "../../utils/clients/orchestrator/client.ts";

export interface EventObserver {
  update(event: AgentEvent): void;
}

@singleton()
export class EventManager implements EventObserver {
  private readonly queue: AgentEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending: Promise<void> = Promise.resolve();

  constructor(
    @inject(OrchestratorClient) private readonly sink: EventSink,
    @inject(ConfigService) private readonly config: ConfigService,
  ) {}

  get pending(): number {
    return this.queue.length;
  }

  async stop(): Promise<void> {
    try {
      await this.sending;
      while (this.queue.length > 0) {
        await this.flush();
      }
    } finally {
      this.clearTimer();
    }
  }

  update(event: AgentEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.config.get().events.batchSize) {
      this.flushInBackground();
    } else {
      this.scheduleFlush();
    }
  }

  flush(): Promise<void> {
    this.clearTimer();
    const run = this.sending.then(() => this.sendNextBatch());
    this.sending = run.catch(() => {});
    return run;
  }

  private async sendNextBatch(): Promise<void> {
    const batch = this.queue.splice(0, this.config.get().events.batchSize);
    if (batch.length === 0) return;
    try {
      await this.sink.sendEvents(batch);
    } catch (error) {
      this.queue.unshift(...batch);
      throw error;
    } finally {
      if (this.queue.length > 0) this.scheduleFlush();
    }
  }

  private flushInBackground(): void {
    this.flush().catch((error: unknown) => {
      console.error(`event flush failed, will retry: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private scheduleFlush(): void {
    this.timer ??= setTimeout(() => this.flushInBackground(), this.config.get().events.flushIntervalMs);
    this.timer.unref();
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
