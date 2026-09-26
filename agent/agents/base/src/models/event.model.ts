export interface AgentEvent {
  readonly type: string;
  /** Unset for events that do not belong to a session, such as environment setup. */
  readonly sessionId?: string;
  readonly time: Date;
  readonly description: string;
}

export interface EventObserver {
  update(event: AgentEvent): void;
}

/** Runtime counters of the event manager, since the process started. */
export interface EventStats {
  readonly received: number;
  readonly receivedByType: Readonly<Record<string, number>>;
  readonly sent: number;
  readonly pending: number;
  readonly batchesSent: number;
  readonly failedBatches: number;
  readonly lastSentAt: Date | null;
  readonly lastError: { readonly message: string; readonly time: Date } | null;
}
