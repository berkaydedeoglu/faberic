import { ConfigService } from "../../src/config/config.service.ts";
import type { AgentEvent } from "../../src/models/index.ts";
import { EventManager } from "../../src/services/event/event-manager.service.ts";
import type { LoggerService } from "../../src/services/log/logger.service.ts";
import type { EventSink } from "../../src/utils/clients/orchestrator/client.ts";
import { createTestLogger } from "./logger.mock.ts";

export class MockEventSink implements EventSink {
  readonly batches: AgentEvent[][] = [];
  failuresLeft = 0;
  delayMs = 0;
  maxConcurrent = 0;
  private inFlight = 0;

  get sent(): AgentEvent[] {
    return this.batches.flat();
  }

  async sendEvents(events: AgentEvent[]): Promise<void> {
    this.inFlight++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    try {
      if (this.delayMs > 0) await Bun.sleep(this.delayMs);
      if (this.failuresLeft > 0) {
        this.failuresLeft--;
        throw new Error("orchestrator down");
      }
      this.batches.push([...events]);
    } finally {
      this.inFlight--;
    }
  }
}

export function eventsConfig(events: Partial<{ batchSize: number; flushIntervalMs: number }> = {}): ConfigService {
  const config = ConfigService.load({});
  return { get: () => ({ ...config, events: { ...config.events, ...events } }) } as ConfigService;
}

export function createMockedEventStack(
  events: Partial<{ batchSize: number; flushIntervalMs: number }> = {},
  logger: LoggerService = createTestLogger().logger,
) {
  const sink = new MockEventSink();
  const manager = new EventManager(sink, eventsConfig(events), logger);
  return { sink, manager, logger };
}
