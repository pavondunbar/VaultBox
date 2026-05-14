import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "1m", target: 100 },
    { duration: "2m", target: 200 },
    { duration: "1m", target: 300 },
    { duration: "2m", target: 300 }, // sustained peak
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    errors: ["rate<0.3"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, { "status 200": (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
  sleep(0.5);
}
