export type SnErrorCategory =
  | "auth"
  | "conflict"
  | "network"
  | "validation"
  | "unknown";

export interface SnCommandErrorContext {
  code: string;
  command: string;
  category?: SnErrorCategory;
  context?: Record<string, unknown>;
}

export interface SnSyncErrorDiagnostic {
  code: string;
  command: string;
  category: SnErrorCategory;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}
