import { inject, singleton } from "tsyringe";
import type { ErrorLogTail, EventStats, SessionInfo } from "../models/index.ts";
import { MonitoringService } from "../services/monitoring/monitoring.service.ts";

@singleton()
export class MonitoringController {
  constructor(@inject(MonitoringService) private readonly monitoring: MonitoringService) {}

  getSessions(): SessionInfo[] {
    return this.monitoring.getSessions();
  }

  getEventStats(): EventStats {
    return this.monitoring.getEventStats();
  }

  getErrors(): Promise<ErrorLogTail> {
    return this.monitoring.getErrors();
  }
}
