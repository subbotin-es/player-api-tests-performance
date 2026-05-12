# player-api-performance

Standalone JMeter 5.6.3 performance suite targeting the **Player API** — an ASP.NET Core 8 REST service hosted on Railway free tier.

[![JMeter Tests](https://github.com/subbotin-es/player-api-performance/actions/workflows/ci.yml/badge.svg)](https://github.com/subbotin-es/player-api-performance/actions/workflows/ci.yml)
[![Live Report](https://img.shields.io/badge/report-GitHub%20Pages-blue)](https://subbotin-es.github.io/player-api-performance/report)

**Target:** https://player-api-tests-production.up.railway.app  
**Source API repo:** https://github.com/subbotin-es/player-api-tests  
**Swagger:** https://player-api-tests-production.up.railway.app/swagger

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
POST /api/tester/login          → extract $.token → jwt_token
POST /api/automationTask/create → extract $.id    → player_id
GET  /api/automationTask/getAll
GET  /api/automationTask/getOne?id=${player_id}
DELETE /api/automationTask/deleteOne/${player_id}
```

Token extraction uses JMeter's **JSON Extractor** (`$.token`). The `Authorization: Bearer ${jwt_token}` header is injected via a thread-group-level **HTTP Header Manager**, activated immediately after login completes.

---

## Test Plans

| Plan | Users | Ramp | Duration | Purpose |
|---|---|---|---|---|
| `smoke.jmx` | 5 | 5 s | 30 s | Is the API alive? Basic auth works? |
| `baseline.jmx` | 10 | 10 s | 60 s | Establish p95/p99 baseline |
| `stress.jmx` | 5 → 15 → 30 | staged | ~100 s | Find Railway free tier degradation point |

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
open reports/smoke/index.html

# Baseline test
bash scripts/run-baseline.sh
open reports/baseline/index.html

# Stress test
bash scripts/run-stress.sh
open reports/stress/index.html
```

### Override Base URL

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

GitHub Actions runs on every push to `main` and on pull requests:

| Step | When | Purpose |
|---|---|---|
| Smoke test | every push / PR | Gate — catches broken auth or endpoints |
| Baseline test | main branch only | p95/p99 trend tracking |
| Stress test | weekly (Monday 11:00 UTC) | Railway degradation curve |

HTML Dashboard is uploaded as a CI artifact (30-day retention).  
The smoke report is published to **GitHub Pages** on every main push.

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
├── FINDINGS.md              # Railway degradation findings
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
└── README.md
```

---

## Findings

See [FINDINGS.md](FINDINGS.md) for documented observations:

1. **Railway cold start** — ~5 s latency; isolated via Warm-Up thread group
2. **ConcurrentDictionary write pressure** — p99 long tail appears at 15+ users
3. **Railway free tier memory ceiling** — 502/503 errors at 25–30 users (~2–5% error rate)
4. **JWT auth overhead** — login accounts for ~15–20% of iteration time at baseline load

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
