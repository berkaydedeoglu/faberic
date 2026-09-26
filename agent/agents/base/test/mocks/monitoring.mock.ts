import { ConfigService } from "../../src/config/config.service.ts";
import { MonitoringController } from "../../src/controllers/monitoring.controller.ts";
import { MonitoringService } from "../../src/services/monitoring/monitoring.service.ts";
import { createMockedEventStack } from "./event-sink.mock.ts";
import { createTestLogger } from "./logger.mock.ts";
import { createMockedSessionStack, MockSessionSdk } from "./session-sdk.mock.ts";

export function monitoringConfig(monitoring: Partial<{ errorLogChars: number; errorLogScanBytes: number }> = {}): ConfigService {
  const config = ConfigService.load({});
  return {
    get: () => ({
      ...config,
      logging: { ...config.logging, file: "/tmp/agent-test.log" },
      monitoring: { ...config.monitoring, ...monitoring },
    }),
  } as ConfigService;
}

/** Sessions report to a real EventManager (with a mocked sink), as they do in the app. */
export function createMockedMonitoringStack(monitoring: Partial<{ errorLogChars: number; errorLogScanBytes: number }> = {}) {
  const { writer, file, logger } = createTestLogger();
  const { sink, manager: eventManager } = createMockedEventStack({ flushIntervalMs: 60_000 }, logger);
  const sessions = createMockedSessionStack(new MockSessionSdk(), eventManager);
  const service = new MonitoringService(sessions.manager, sessions.service, eventManager, file, monitoringConfig(monitoring));
  const controller = new MonitoringController(service);
  return { writer, file, logger, sink, eventManager, sessions, service, controller };
}
