import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const errorRate = new Rate("errors");
const loginDuration = new Trend("login_duration");
const walletListDuration = new Trend("wallet_list_duration");
const healthDuration = new Trend("health_duration");

export const options = {
  stages: [
    { duration: "30s", target: 10 },  // ramp up
    { duration: "1m", target: 50 },   // sustained load
    { duration: "30s", target: 100 }, // peak
    { duration: "30s", target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    errors: ["rate<0.1"],
  },
};

export function setup() {
  // Register a test user for authenticated scenarios
  const email = `loadtest-${Date.now()}@test.local`;
  const password = "LoadTest123!@#";
  const res = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({ email, password }), {
    headers: { "Content-Type": "application/json" },
  });
  const cookies = res.cookies;
  return { email, password, cookies };
}

export default function (data) {
  // 1. Health check (unauthenticated)
  const health = http.get(`${BASE_URL}/api/health`);
  healthDuration.add(health.timings.duration);
  check(health, { "health 200": (r) => r.status === 200 });
  errorRate.add(health.status !== 200);

  // 2. Login
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: data.email, password: data.password }),
    { headers: { "Content-Type": "application/json" } },
  );
  loginDuration.add(login.timings.duration);
  check(login, { "login 200": (r) => r.status === 200 });
  errorRate.add(login.status !== 200);

  if (login.status !== 200) {
    sleep(1);
    return;
  }

  // 3. List wallets (authenticated)
  const jar = http.cookieJar();
  const loginCookies = login.cookies;
  if (loginCookies && loginCookies["session"]) {
    jar.set(BASE_URL, "session", loginCookies["session"][0].value);
  }

  const wallets = http.get(`${BASE_URL}/api/wallets`, { cookies: jar.cookiesForURL(BASE_URL) });
  walletListDuration.add(wallets.timings.duration);
  check(wallets, { "wallets 200": (r) => r.status === 200 });
  errorRate.add(wallets.status !== 200);

  sleep(1);
}
