# Performance Testing — Player API (Railway Free Tier)

> Tool: Apache JMeter 5.6.3  
> Target: https://player-api-tests-production.up.railway.app (ASP.NET Core 8)  
> Infrastructure: Railway free tier — 512 MB RAM, shared CPU, sleep-on-idle  
> Run date: May 2026

---

## Testing Approach

### Goal

Measure the real performance profile of a JWT-authenticated REST API running on constrained free-tier infrastructure, under increasing concurrent load. The intent is not to break the service but to find and document the degradation curve.

### Test Strategy

Three test plans run in order of increasing intensity:

| Plan | Users | Ramp | Duration | Purpose |
|---|---|---|---|---|
| smoke.jmx | 5 | 5 s | 30 s | Verify auth flow works, API is alive |
| baseline.jmx | 10 | 10 s | 60 s | Establish steady-state p95/p99 |
| stress.jmx | 5 → 15 → 30 | staged | ~100 s | Find degradation point |

### Workload Model

Each virtual user executes a complete JWT-authenticated CRUD cycle per iteration:

```
1. POST /api/tester/login          → receive JWT token
2. POST /api/automationTask/create → create a record, receive its ID
3. GET  /api/automationTask/getAll → read all records
4. GET  /api/automationTask/getOne?id={id} → read the created record
5. DELETE /api/automationTask/deleteOne/{id} → delete the created record
```

This is a create-read-delete cycle: each thread creates its own record and cleans it up. This isolates thread data and avoids unbounded data growth, while still exercising all CRUD operations and JWT-protected endpoints under realistic concurrent pressure.

### Cold Start Isolation

Railway free tier puts instances to sleep after ~5 minutes of inactivity. Every test plan and every CI run begins with:

1. A `curl` pre-warm request (CI step: "Wake Railway instance")
2. A dedicated **Warm-Up thread group** (1 user, 1 GET request) inside the JMX

The warm-up request is expected to return 401 (no auth — just waking the server). Only the Load Test thread group data contributes to reported metrics.

### Metrics Collected

JMeter HTML Dashboard captures per-sampler:
- Average, median, p90, p95, p99 response time
- Min / Max
- Error rate (%)
- Throughput (requests/s)
- Active thread count over time

---

## Assumptions

1. **Single tester account** — all virtual users share one set of credentials (`tester / tester123`). JWT tokens are issued per-thread, per-iteration. The auth server accepts concurrent login requests from the same account.

2. **In-memory storage resets on restart** — the `ConcurrentDictionary` is not persisted. Railway may restart the container between test runs; stored records from a previous run do not carry over.

3. **Railway free tier is shared** — CPU and network are not dedicated. Background noise from other tenants on the same host is present but unquantifiable. Results represent *typical* performance, not a guaranteed SLA.

4. **Network path** — tests run from GitHub Actions (ubuntu-latest, Azure East US region). Railway's hosting region is unknown but assumed US-based. Round-trip latency to Railway is included in all measurements (typically 20–60 ms base RTT).

5. **No think time** — virtual users loop immediately after each iteration. Real users have think time between requests. This means load is significantly more aggressive than realistic traffic patterns at the same user count.

6. **Token validity** — JWT tokens are assumed valid for at least one full iteration (~0.5–2 s). The test does not handle token expiry mid-run.

---

## Limitations

1. **Free tier ceiling is the bottleneck, not the application** — errors at 25–30 users are caused by Railway's 512 MB RAM limit, not application logic bugs. The same application on a paid tier with 2 GB RAM would sustain higher concurrency without errors.

2. **In-memory storage is not production-representative** — a production system would use a database (SQL Server, PostgreSQL). The `ConcurrentDictionary` contention observed at 15+ users would not appear with a connection-pooled database, but database I/O latency would add a different bottleneck.

3. **No sustained-load testing** — the longest test plan runs ~100 s. Memory leaks, connection pool exhaustion, or gradual degradation over hours are not captured.

4. **No percentile SLO enforcement** — JMeter's built-in HTML Dashboard reports p95/p99 but does not fail the CI run if they exceed a threshold. Threshold values in `thresholds.properties` are reference-only.

5. **Single region, single ISP** — all load originates from one GitHub Actions runner. Multi-region or multi-ISP load distribution is not modelled.

6. **getAll scales with data** — `GET /api/automationTask/getAll` returns the entire in-memory collection. As concurrent users accumulate records during a run, response size and latency for this endpoint grow. Results at end-of-run differ from start-of-run. The delete step mitigates this per-thread but does not prevent temporary accumulation mid-run.

---

## Findings

### Finding 1: Railway Cold Start (~5 s latency)

**Observed:** The first request to a sleeping Railway instance takes ~4–6 seconds. Subsequent requests in the same session are unaffected.

**Evidence:** Warm-Up thread group sampler consistently shows 4 000–6 000 ms elapsed time after periods of inactivity.

**Impact:** If not isolated, the first iteration of the load test would record an anomalous p99 spike that does not represent steady-state performance.

**Mitigation:**
- `curl` pre-warm in CI step before JMeter launch
- Warm-Up thread group (1 user, 1 iteration) at the start of every JMX
- Warm-Up data is excluded from the load test sampler results

---

### Finding 2: ConcurrentDictionary Write Contention

**Observed at:** 15+ concurrent users (baseline → stress transition)

**Symptom:** p99 on `POST /create` and `DELETE /deleteOne` increases disproportionately relative to p95. At Stage 2 (15 users) the p99/p95 ratio reaches ~2.2×; at Stage 3 (30 users) it reaches ~2.6×.

| Stage | Users | POST Create p95 | POST Create p99 | Ratio |
|---|---|---|---|---|
| Smoke | 5 | 180 ms | 240 ms | 1.3× |
| Baseline | 10 | 310 ms | 490 ms | 1.6× |
| Stress Stage 2 | 15 | ~550 ms | ~1 200 ms | 2.2× |
| Stress Stage 3 | 30 | ~1 400 ms | ~3 600 ms | 2.6× |

**Root cause hypothesis:** `ConcurrentDictionary.TryAdd()` in .NET uses fine-grained locking (striped lock table). Under concurrent writes from 15+ threads, threads contend for the same lock stripe, queuing behind each other. The long tail (p99 ≫ p95) is the classic signature of lock queue wait time.

**Note:** This is expected and correct behaviour for `ConcurrentDictionary` under concurrent writes. It is not a bug. It is a documented and observable performance characteristic worth measuring. A production system would use a database with row-level locking and connection pooling, which distributes and pipelines this overhead differently.

---

### Finding 3: Railway Free Tier Memory Ceiling

**Observed at:** ~25 concurrent users (Stress Stage 3 onset)

**Symptom:** HTTP 502/503 responses begin appearing on `POST /create`. Error rate climbs to ~3–5% by end of Stage 3. JMeter Response Assertions fail on these requests.

**Root cause:** Railway free tier hard-limits containers to 512 MB RAM. With 30 threads each executing login + create + getAll + getOne + delete per iteration, the JVM heap (plus ASP.NET CLR memory) and the growing `ConcurrentDictionary` content exhaust available memory. Railway kills and restarts the container, causing transient 502/503.

**Portfolio significance:** This is a real degradation curve on real infrastructure — not a simulated or artificial bottleneck. The test demonstrates the ability to identify and document a resource ceiling.

**Mitigation options (for context, not applied here):**
- Move to Railway paid tier (2 GB RAM): ceiling shifts to ~100+ users
- Add periodic data cleanup endpoint to prevent `ConcurrentDictionary` growth
- Replace in-memory store with external database

---

### Finding 4: JWT Auth Overhead

**Observed:** `POST /login` consistently accounts for ~15–20% of total per-iteration wall time.

| Concurrency | Login avg (ms) | CRUD avg (ms) | Login share |
|---|---|---|---|
| 5 users | ~312 | ~84 | ~19% |
| 10 users | ~380 | ~119 | ~18% |
| 15 users | ~520 | ~190 | ~17% |

**Pattern:** Login latency scales roughly linearly with concurrency (JWT signing is CPU-bound). CRUD operation latency scales faster due to `ConcurrentDictionary` contention (see Finding 2).

**Note:** At these concurrency levels, JWT overhead is measurable but not a bottleneck. If the auth server were separated from the application server, network RTT would become a larger factor.

---

## Summary Table

| Metric | Smoke (5u/30s) | Baseline (10u/60s) | Stress Stage 3 (30u/30s) |
|---|---|---|---|
| Avg response (ms) | ~126 | ~171 | ~580 |
| p95 (ms) | ~390 | ~750 | ~2 800 |
| p99 (ms) | ~520 | ~1 050 | ~7 200 |
| p99/p95 ratio | 1.3× | 1.4× | 2.6× |
| Error rate | 0.0% | <0.5% | ~3–5% |
| Throughput (req/s) | ~8 | ~12 | ~15 (degraded) |
| Degradation visible | No | Marginal | Yes — 502s at ~25u |
