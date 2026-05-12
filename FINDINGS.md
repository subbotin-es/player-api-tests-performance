# Performance Findings — Player API (Railway Free Tier)

> Collected via Apache JMeter 5.6.3 against ASP.NET Core 8 on Railway free tier.
> Target: https://player-api-tests-production.up.railway.app

---

## Finding 1: Railway Cold Start

**Observed:** ~5 second latency on first request after inactivity (Railway free tier sleeps after 5 minutes idle)
**Impact:** Without isolation this would inflate smoke test p95/p99 and mask true steady-state performance
**Mitigation:** `curl` wake-up step in CI before JMeter run; dedicated Warm-Up Thread Group (1 user, 1 iteration) in every test plan
**Note:** Cold start is isolated to the Warm-Up thread group and excluded from the Load Test measurements

---

## Finding 2: ConcurrentDictionary Under Write Pressure

**Observed at:** 15+ concurrent users (baseline → stress transition)
**Symptom:** p99 increases disproportionately versus p95 — long tail appears on POST `/create` and DELETE `/deleteOne`
**Root cause hypothesis:** `ConcurrentDictionary.TryAdd()` lock contention under concurrent writes from multiple threads
**Supporting data:** p95 remains stable while p99 grows 2–3× — classic long-tail signature of contention
**Note:** Expected behaviour for an in-memory thread-safe collection under concurrent write pressure — not a bug. Documented here as realistic enterprise bottleneck signal.

---

## Finding 3: Railway Free Tier Memory Ceiling

**Observed at:** 25–30 concurrent users (stress test Stage 3)
**Symptom:** 502/503 responses begin appearing (~2–5% error rate); JMeter Response Assertions on POST `/create` start failing
**Root cause:** Railway free tier hard ceiling of 512 MB RAM. The in-memory `ConcurrentDictionary` accumulates entries per iteration across all concurrent threads, eventually exhausting available heap.
**Portfolio significance:** Real degradation curve on real infrastructure — not a simulated bottleneck. Demonstrates that 30 concurrent users is the practical stress ceiling for this target.

---

## Finding 4: JWT Auth Overhead

**Observed:** Login sampler consistently accounts for ~15–20% of total iteration time
**Pattern:** `POST /login` p95 ≈ 250–400 ms; subsequent CRUD operations ≈ 50–150 ms each
**Note:** JWT generation + validation overhead is measurable but not a bottleneck at these concurrency levels. Documented as baseline for comparison if auth backend changes.

---

## Summary Table

| Metric | Smoke (5u/30s) | Baseline (10u/60s) | Stress Stage 3 (30u/30s) |
|---|---|---|---|
| p95 (ms) | ~400 | ~800 | ~2500 |
| p99 (ms) | ~800 | ~1800 | ~6000 |
| Error rate | 0% | <1% | ~3–5% |
| Throughput (req/s) | ~8 | ~12 | ~15 (degraded) |

*Values are indicative — run the tests locally to get current Railway instance measurements.*
