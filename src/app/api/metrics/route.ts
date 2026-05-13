import { collectMetrics } from "@/lib/monitoring/metrics";

export async function GET() {
  const body = collectMetrics();
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
