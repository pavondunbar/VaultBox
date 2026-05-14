import { NextRequest, NextResponse } from "next/server";
import { metrics } from "./metrics";

type RouteHandler = (req: NextRequest | Request, ctx?: unknown) => Promise<Response | NextResponse>;

/**
 * Wraps a Next.js route handler to record Prometheus metrics
 * (request count, duration histogram, error count).
 */
export function withMetrics(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const path = new URL(req.url).pathname;
    const method = req.method;
    const end = metrics.httpRequestDuration.startTimer({ method, path });

    const res = await handler(req, ctx);

    const status = String(res.status);
    end();
    metrics.httpRequestsTotal.inc({ method, path, status });
    if (res.status >= 400) {
      metrics.httpErrors.inc({ method, path, status });
    }
    return res;
  };
}
