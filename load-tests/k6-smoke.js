import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    checks: ["rate==1"],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    "health returns 200": (r) => r.status === 200,
    "health body has status": (r) => JSON.parse(r.body).status === "healthy",
  });
}
