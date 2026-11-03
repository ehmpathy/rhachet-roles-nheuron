/**
 * .what = minimal log interface for gather adapters
 * .why = avoids hard dependency on visualogic for domain objects;
 *        cross-cut concern, shared across auth and mail adapters
 */
export interface GatherLogMethods {
  debug: (message: string, metadata?: Record<string, unknown>) => void;
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
}
