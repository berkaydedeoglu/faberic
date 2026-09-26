import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../config/config.service.ts";
import type { ErrorLogTail, EventStats, SessionInfo } from "../../models/index.ts";
import { EventManager } from "../event/event-manager.service.ts";
import { FileLogWriter, type LogFile } from "../log/log-writers.ts";
import { isErrorLine } from "../log/logger.service.ts";
import { SessionManagerService } from "../session/session-manager.service.ts";
import { SessionService } from "../session/session.service.ts";

/** Read-only view of the runtime state: open sessions, event delivery, and logged errors. */
@singleton()
export class MonitoringService {
  constructor(
    @inject(SessionManagerService) private readonly sessionManager: SessionManagerService,
    @inject(SessionService) private readonly sessionService: SessionService,
    @inject(EventManager) private readonly eventManager: EventManager,
    @inject(FileLogWriter) private readonly logFile: LogFile,
    @inject(ConfigService) private readonly config: ConfigService,
  ) {}

  getSessions(): SessionInfo[] {
    return this.sessionManager.listSessions().map(({ id }) => ({
      ...this.sessionService.describe(id),
      stats: this.sessionService.getStats(id),
    }));
  }

  getEventStats(): EventStats {
    return this.eventManager.stats();
  }

  /**
   * Only the end of the log file is read (`errorLogScanBytes`), so the cost does not grow with the
   * file. A partial first line does not match the error pattern and is dropped.
   */
  async getErrors(): Promise<ErrorLogTail> {
    const { errorLogChars, errorLogScanBytes } = this.config.get().monitoring;
    const tail = await this.logFile.readTail(errorLogScanBytes);
    const log = tail.split("\n").filter(isErrorLine).join("\n");
    return { file: this.config.get().logging.file, log: log.slice(-errorLogChars) };
  }
}
