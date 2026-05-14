# Load Tests

Load testing scripts using [k6](https://k6.io/).

## Install k6

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Run

```bash
# Smoke test (1 VU, 1 iteration — sanity check)
k6 run load-tests/k6-smoke.js

# Load test (ramp to 100 VUs)
k6 run load-tests/k6-load-test.js

# Stress test (ramp to 300 VUs)
k6 run load-tests/k6-stress.js

# Custom base URL
k6 run -e BASE_URL=https://staging.example.com load-tests/k6-load-test.js
```

## Thresholds

| Test | p95 Latency | Error Rate |
|------|-------------|------------|
| Smoke | < 2000ms | 0% |
| Load | < 500ms | < 10% |
| Stress | < 1000ms | < 30% |
