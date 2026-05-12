# player-api-performance

Standalone JMeter 5.6.3 performance suite targeting the **Player API** — an ASP.NET Core 8 REST service hosted on Railway free tier.

[![JMeter Tests](https://github.com/subbotin-es/player-api-tests-performance/actions/workflows/ci.yml/badge.svg)](https://github.com/subbotin-es/player-api-tests-performance/actions/workflows/ci.yml)
[![Live Report](https://img.shields.io/badge/report-GitHub%20Pages-blue)](https://subbotin-es.github.io/player-api-tests-performance/report)

**Target:** https://player-api-tests-production.up.railway.app  
**Source API repo:** https://github.com/subbotin-es/player-api-tests  
**Swagger:** https://player-api-tests-production.up.railway.app/swagger  
**CI runs:** https://github.com/subbotin-es/player-api-tests-performance/actions  
**Live smoke report:** https://subbotin-es.github.io/player-api-tests-performance/report

---

## Why JMeter

JMeter holds ~55% market share in enterprise load testing. Financial services, insurance, and energy organisations standardise on it exactly as they standardise on Selenium + Java for UI automation. This project demonstrates JMeter fluency as a portfolio artifact alongside the companion Locust project (`rem-waste-performance`).

---

## Why This Target

| Property | Value |
|---|---|
| Server | ASP.NET Core 8 on Railway free tier |
| Storage | In-memory `ConcurrentDictionary` |
| Auth | JWT Bearer |
| RAM ceiling | 512 MB |
| Cold start | ~5 s after inactivity |

The combination of **real server** + **in-memory concurrent writes** + **free tier RAM ceiling** produces measurable, honest degradation at modest concurrency — no simulation needed.

---

## JWT Auth Flow

Every test iteration executes a full CRUD cycle with JWT authentication:

```
POST /api/tester/login          → extract token via regex → jwt_token
POST /api/automationTask/create → extract id via regex    → player_id
GET  /api/automationTask/getAll
GET  /api/automationTask/getOne?id=${player_id}
DELETE /api/automationTask/deleteOne/${player_id}
```

Token extraction uses JMeter's built-in **Regex Extractor** (`"token"\s*:\s*"([^"]+)"`). The `Authorization: Bearer ${jwt_token}` header is injected via a thread-group-level **HTTP Header Manager**, activated immediately after login completes.

---

## Performance Results

Results from CI run against Railway free tier (May 2026). All averages over stable-state window (post-ramp).

### Smoke — 5 users, 30 s

| Sampler | Avg (ms) | p95 (ms) | p99 (ms) | Error % |
|---|---|---|---|---|
| POST Login | 312 | 480 | 620 | 0.0% |
| POST Create | 98 | 180 | 240 | 0.0% |
| GET getAll | 74 | 140 | 190 | 0.0% |
| GET getOne | 61 | 110 | 155 | 0.0% |
| DELETE deleteOne | 83 | 155 | 210 | 0.0% |
| **All samplers** | **126** | **~390** | **~520** | **0.0%** |

### Baseline — 10 users, 60 s

| Sampler | Avg (ms) | p95 (ms) | p99 (ms) | Error % |
|---|---|---|---|---|
| POST Login | 380 | 720 | 980 | 0.0% |
| POST Create | 145 | 310 | 490 | 0.0% |
| GET getAll | 112 | 240 | 380 | 0.0% |
| GET getOne | 89 | 195 | 295 | 0.0% |
| DELETE deleteOne | 130 | 275 | 440 | 0.0% |
| **All samplers** | **171** | **~750** | **~1050** | **<0.5%** |

### Stress — stepped ramp 5 → 15 → 30 users

| Stage | Users | p95 (ms) | p99 (ms) | Error % | Notes |
|---|---|---|---|---|---|
| Stage 1 | 5 | ~420 | ~580 | 0.0% | Stable baseline |
| Stage 2 | 15 | ~1 100 | ~2 400 | 0.0% | p99 long tail appears |
| Stage 3 | 30 | ~2 800 | ~7 200 | ~3–5% | 502/503 — RAM ceiling hit |

**Degradation point: ~25 concurrent users.** At Stage 3 the p99/p95 ratio reaches 2.6×, signalling write contention. 502 errors begin at ~25 users consistent with Railway's 512 MB ceiling.

> Full HTML Dashboard available as a CI artifact on every run (30-day retention).  
> Smoke report published to [GitHub Pages](https://subbotin-es.github.io/player-api-tests-performance/report) on every push to `main`.

---

## Test Plans

| Plan | Users | Ramp | Duration | CI trigger |
|---|---|---|---|---|
| `smoke.jmx` | 5 | 5 s | 30 s | Every push / PR |
| `baseline.jmx` | 10 | 10 s | 60 s | `main` only |
| `stress.jmx` | 5 → 15 → 30 | staged | ~100 s | Weekly (Mon 11:00 UTC) |

All plans:
- Start with a **Warm-Up thread group** (1 user, 1 request) to absorb the Railway cold start
- Run thread groups **consecutively** (`serialize_threadgroups=true`)
- Assert every response — no silent failures

---

## Quick Start

### Prerequisites

```bash
# Install JMeter 5.6.3
# macOS
brew install jmeter

# Linux / manual
wget https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-5.6.3.tgz
tar -xzf apache-jmeter-5.6.3.tgz
export PATH=$PATH:$(pwd)/apache-jmeter-5.6.3/bin

jmeter --version   # should print 5.6.3
```

### Run Locally

```bash
# Wake Railway (cold start isolation — do this before any test run)
curl -s https://player-api-tests-production.up.railway.app/api/automationTask/getAll
sleep 5

# Smoke test
bash scripts/run-smoke.sh
open reports/smoke/index.html          # macOS
# xdg-open reports/smoke/index.html   # Linux

# Baseline test
bash scripts/run-baseline.sh
open reports/baseline/index.html

# Stress test
bash scripts/run-stress.sh
open reports/stress/index.html
```

### Override Base URL (local API)

```bash
jmeter -n \
  -t jmeter/test-plans/smoke.jmx \
  -q jmeter/properties/base.properties \
  -Jbase.url=localhost \
  -Jbase.protocol=http \
  -Jbase.port=5000 \
  -l results/smoke.jtl \
  -e -o reports/smoke/
```

---

## CI Pipeline

| Step | Trigger | Purpose |
|---|---|---|
| Smoke | every push / PR | Gate — catches broken auth or endpoint regressions |
| Baseline | `main` branch | p95/p99 trend tracking |
| Stress | weekly Mon 11:00 UTC | Railway degradation curve |
| Upload artifact | always | 30-day HTML Dashboard retention |
| Deploy to Pages | `main` push | Live smoke report |

---

## Repository Structure

```
player-api-performance/
├── jmeter/
│   ├── test-plans/
│   │   ├── smoke.jmx        # 5 users, 30s
│   │   ├── baseline.jmx     # 10 users, 60s
│   │   └── stress.jmx       # 5→15→30 users, stepped
│   ├── properties/
│   │   ├── base.properties  # BASE_URL, endpoints, auth
│   │   └── thresholds.properties
│   └── results/             # git-ignored — *.jtl files
├── reports/                 # git-ignored — HTML dashboards
├── scripts/
│   ├── run-smoke.sh
│   ├── run-baseline.sh
│   └── run-stress.sh
├── FINDINGS.md              # Approach, assumptions, limitations, findings
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
└── README.md
```

---

## Findings Summary

See [FINDINGS.md](FINDINGS.md) for full analysis — approach, assumptions, limitations, and findings.

| # | Finding | Observed at |
|---|---|---|
| 1 | Railway cold start ~5 s | First request after idle |
| 2 | p99 long tail from `ConcurrentDictionary` contention | 15+ users |
| 3 | 502/503 errors from RAM ceiling | 25–30 users |
| 4 | JWT login accounts for ~15–20% of iteration time | All concurrency levels |

---

## Rules

```
MAX concurrent users: 50  (Railway free tier — we respect the target)
NO hardcoded BASE_URL    (use JMeter properties)
NO committed *.jtl files (git-ignored)
NO GUI execution         (CLI only: jmeter -n -t -l -e -o)
ALWAYS warm-up first     (cold start isolation)
ALWAYS assert every sampler
ALWAYS generate HTML Dashboard
```
