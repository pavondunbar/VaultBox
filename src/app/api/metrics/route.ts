import { collectMetrics, registry } from "@/lib/monitoring/metrics";

export async function GET() {
  const body = await collectMetrics();
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": registry.contentType },
  });
}
