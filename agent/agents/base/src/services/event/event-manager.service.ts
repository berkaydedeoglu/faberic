import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../config/config.service.ts";
import type { AgentEvent, EventObserver, EventStats, Logger } from "../../models/index.ts";
import { type EventSink, OrchestratorClient } from "../../utils/clients/orchestrator/client.ts";
import { LoggerService } from "../log/logger.service.ts";

@singleton()
export class EventManager implements EventObserver {
  private readonly queue: AgentEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending: Promise<void> = Promise.resolve();
  private readonly counters = {
    received: 0,
    receivedByType: {} as Record<string, number>,
    sent: 0,
    batchesSent: 0,
    failedBatches: 0,
    lastSentAt: null as Date | null,
    lastError: null as EventStats["lastError"],
  };

  constructor(
    @inject(OrchestratorClient) private readonly sink: EventSink,
    @inject(ConfigService) private readonly config: ConfigService,
    @inject(LoggerService) private readonly logger: Logger,
  ) {}

  get pending(): number {
    return this.queue.length;
  }

  stats(): EventStats {
    const { receivedByType, lastError, ...counters } = this.counters;
    return { ...counters, receivedByType: { ...receivedByType }, lastError, pending: this.pending };
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
    this.counters.received++;
    this.counters.receivedByType[event.type] = (this.counters.receivedByType[event.type] ?? 0) + 1;
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
      this.counters.sent += batch.length;
      this.counters.batchesSent++;
      this.counters.lastSentAt = new Date();
    } catch (error) {
      this.queue.unshift(...batch);
      this.counters.failedBatches++;
      this.counters.lastError = { message: error instanceof Error ? error.message : String(error), time: new Date() };
      throw error;
    } finally {
      if (this.queue.length > 0) this.scheduleFlush();
    }
  }

  private flushInBackground(): void {
    this.flush().catch((error: unknown) => {
      this.logger.error("event flush failed, will retry", error);
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
