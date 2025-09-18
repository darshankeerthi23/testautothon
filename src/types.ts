export type FailureRecord = {
  test_id: string;
  suite?: string;
  component?: string;
  message: string;
  stack?: string;
  timestamp?: string;

  // filled by pipeline
  category?: string;
  reasoning?: string;
  suspected_component?: string;
  correlated_ticket?: string;
  correlation_score?: number;
  extra?: Record<string, unknown>;
};

export type TicketRow = { key: string; summary?: string; description?: string };
