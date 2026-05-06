type RequestLogEntry = {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string;
  ip: string;
  userAgent: string;
};

type SecurityEvent =
  | "failed_login"
  | "rate_limit_hit"
  | "unauthorized_access"
  | "2fa_failed";

type SecurityLogEntry = {
  timestamp: string;
  event: SecurityEvent;
  ip: string;
  userId?: string;
  details?: string;
};

export function logRequest(entry: RequestLogEntry): void {
  console.log(JSON.stringify({ type: "request", ...entry }));
}

export function logSecurityEvent(entry: SecurityLogEntry): void {
  console.warn(JSON.stringify({ type: "security", ...entry }));
}
