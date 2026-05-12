# CLAUDE.md — player-api-performance
# Standalone JMeter project targeting Player API on Railway

> **This file is the authoritative specification for Claude Code.**
> Read it completely before writing any JMX, any config, any CI step.
> This is a standalone performance project — separate repo from player-api-tests.
> When in doubt — ask. Do not invent scenarios. Do not exceed Railway free tier limits.

**Author:** Evgenii Subbotin
**Repo:** player-api-performance (standalone)
**Performance tool:** Apache JMeter 5.6+
**Target:** https://player-api-tests-production.up.railway.app (ASP.NET Core 8 / Railway free tier)
**Source API:** https://github.com/subbotin-es/player-api-tests
**Swagger:** https://player-api-tests-production.up.railway.app/swagger
**Version:** 1.0 | May 2026

---

## 1. What This Project Does

Standalone JMeter performance suite targeting the Player API REST service
running on Railway free tier. This is the **legacy/enterprise stack standalone** —
the counterpart to `rem-waste-performance` (Locust / modern stack).

**Why JMeter:**
55% market share. Every enterprise QA team has JMeter expertise or tooling.
Financial services, insurance, energy — these organisations standardise on JMeter
for load testing exactly as they standardise on Selenium + Java for UI automation.
This project demonstrates that fluency.

**What makes this target ideal:**
- Real application server — ASP.NET Core 8 on Railway free tier (512MB RAM, shared CPU)
- In-memory `ConcurrentDictionary` under concurrent write pressure → measurable contention
- JWT authentication flow — realistic enterprise API pattern
- Railway free tier cold start (~5s) — measurable and documentable
- Free tier resource limits → degradation is real, not simulated

**Realistic test scenarios (JWT-authenticated CRUD flow):**
```
POST /api/tester/login → extract token → use token for:
  POST /api/automationTask/create   (write pressure)
  GET  /api/automationTask/getAll   (read pressure)
  GET  /api/automationTask/getOne   (targeted read)
  DELETE /api/automationTask/deleteOne  (write + delete pressure)
```

**What we measure:**
```
✅ Cold start latency (first request after Railway sleep)
✅ p95 / p99 under increasing concurrent users
✅ JWT auth flow performance (login + token extract + use)
✅ Concurrent write pressure on ConcurrentDictionary
✅ Railway free tier degradation curve (real)
✅ Error rate under stress (500 RAM limit)
✅ JMeter HTML Dashboard report
```

---

## 2. Absolute Rules

```
NEVER exceed 50 concurrent users — Railway free tier, we respect the target
NEVER hardcode BASE_URL — use JMeter User Defined Variables or properties
NEVER commit JMeter test results (*.jtl) — git-ignored
NEVER use JMeter GUI for test execution — CLI only in CI and documented locally
NEVER skip the warm-up period — Railway cold start must be isolated from measurement
ALWAYS use JSON Extractor for JWT token — never hardcode tokens
ALWAYS use HTTP Header Manager for Bearer auth — per-thread group, not per-request
ALWAYS add Response Assertion on every sampler — no silent failures
ALWAYS document Railway free tier limitations in README — honest framing
ALWAYS generate HTML Dashboard — this is the portfolio artifact
```

---

## 3. Tech Stack

| Layer | Technology | Version | Why |
|---|---|---|---|
| Load tool | Apache JMeter | 5.6.3 | 55% market share, XML-based, CI-compatible |
| Execution | JMeter CLI (`-n -t -l -e -o`) | — | No GUI in CI — standard enterprise practice |
| Report | JMeter HTML Dashboard | built-in | `--reporting-output-folder` — professional output |
| CI | GitHub Actions | current | `QAInsights/setup-jmeter` action |
| Target | ASP.NET Core 8 on Railway | free tier | Real server, real degradation |
| Auth | JWT Bearer — extracted via JSON Extractor | — | Realistic enterprise API pattern |

---

## 4. Repository Structure

```
player-api-performance/
├── jmeter/
│   ├── test-plans/
│   │   ├── smoke.jmx               # 5 users, 30s — is the API alive?
│   │   ├── baseline.jmx            # 10 users, 60s — p95/p99 baseline
│   │   └── stress.jmx              # ramp 5→30 users — find degradation point
│   ├── properties/
│   │   ├── base.properties         # BASE_URL, endpoints
│   │   └── thresholds.properties   # performance thresholds (reference only)
│   └── results/                    # git-ignored — *.jtl files
├── reports/                        # git-ignored — generated HTML dashboards
├── scripts/
│   ├── run-smoke.sh                # local run script
│   ├── run-baseline.sh
│   └── run-stress.sh
├── FINDINGS.md                     # Railway degradation findings
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
└── README.md
```

---

## 5. JMeter Properties

```properties
# jmeter/properties/base.properties
base.url=player-api-tests-production.up.railway.app
base.protocol=https
base.port=443

# Endpoints
endpoint.login=/api/tester/login
endpoint.create=/api/automationTask/create
endpoint.get.all=/api/automationTask/getAll
endpoint.get.one=/api/automationTask/getOne
endpoint.delete=/api/automationTask/deleteOne

# Auth credentials (test account — not production secrets)
auth.username=tester
auth.password=tester123
```

---

## 6. Test Plan Structure — JMX Architecture

All three JMX files share the same architecture. Document it here; Claude Code implements it.

### Thread Group structure for smoke.jmx and baseline.jmx:

```
Test Plan
├── User Defined Variables
│   ├── BASE_URL = ${__P(base.url, player-api-tests-production.up.railway.app)}
│   ├── PROTOCOL = ${__P(base.protocol, https)}
│   └── PORT    = ${__P(base.port, 443)}
│
├── HTTP Request Defaults (apply to all samplers)
│   ├── Protocol: ${PROTOCOL}
│   ├── Server: ${BASE_URL}
│   └── Port: ${PORT}
│
├── Thread Group: Warm-Up (1 user, 1 iteration — isolate cold start)
│   └── HTTP Request: GET /api/automationTask/getAll
│       └── Response Assertion: status 401 (no auth — just wakes the server)
│
└── Thread Group: Load Test
    ├── HTTP Header Manager (Bearer token — populated by login)
    │
    ├── Sampler 1: POST /api/tester/login
    │   ├── JSON Extractor: $.token → jwt_token variable
    │   └── Response Assertion: status 200
    │
    ├── HTTP Header Manager: Authorization: Bearer ${jwt_token}
    │
    ├── Sampler 2: POST /api/automationTask/create
    │   ├── Body: {"username": "perf_${__threadNum}_${__Random(1000,9999)}", "email": "perf${__threadNum}@test.example"}
    │   ├── JSON Extractor: $.id → player_id variable
    │   └── Response Assertion: status 201
    │
    ├── Sampler 3: GET /api/automationTask/getAll
    │   └── Response Assertion: status 200
    │
    ├── Sampler 4: GET /api/automationTask/getOne?id=${player_id}
    │   └── Response Assertion: status 200
    │
    └── Sampler 5: DELETE /api/automationTask/deleteOne/${player_id}
        └── Response Assertion: status 204
```

### Thread counts per plan:

| Plan | Users | Ramp | Duration | Purpose |
|---|---|---|---|---|
| smoke.jmx | 5 | 5s | 30s | API alive, basic auth works |
| baseline.jmx | 10 | 10s | 60s | p95/p99 baseline |
| stress.jmx | 5→30 | stepped | 120s | Find degradation point |

### stress.jmx thread group — stepped ramp:

```
Stage 1: 5 users, 30s   — establish baseline
Stage 2: 15 users, 30s  — moderate load
Stage 3: 30 users, 30s  — stress — Railway free tier should show degradation
Stage 4: 0 users, 10s   — cooldown
```

---

## 7. JMX File Generation Note

JMX files are XML and verbose. Claude Code should generate them using JMeter's
documented XML structure. Key elements per sampler:

```xml
<!-- HTTP Sampler skeleton -->
<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="POST Login">
  <stringProp name="HTTPSampler.path">/api/tester/login</stringProp>
  <stringProp name="HTTPSampler.method">POST</stringProp>
  <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
  <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
    <collectionProp name="Arguments.arguments">
      <elementProp elementType="HTTPArgument">
        <stringProp name="Argument.value">{"username":"tester","password":"tester123"}</stringProp>
        <stringProp name="Argument.metadata">=</stringProp>
      </elementProp>
    </collectionProp>
  </elementProp>
</HTTPSamplerProxy>

<!-- JSON Extractor skeleton -->
<JSONPathExtractor guiclass="JSONPathExtractorGui" testclass="JSONPathExtractor" testname="Extract token">
  <stringProp name="JSONPostProcessor.referenceNames">jwt_token</stringProp>
  <stringProp name="JSONPostProcessor.jsonPathExprs">$.token</stringProp>
  <stringProp name="JSONPostProcessor.defaultValues">TOKEN_NOT_FOUND</stringProp>
</JSONPathExtractor>
```

---

## 8. CI Pipeline

```yaml
# .github/workflows/ci.yml
name: Player API — JMeter Performance Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 11 * * 1'   # Monday 11:00 UTC (after Locust standalone at 12:00)

jobs:
  performance:
    name: JMeter Load Test
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - name: Setup JMeter
        uses: QAInsights/setup-jmeter@v3.0
        with:
          jmeter-version: '5.6.3'

      - name: Wake Railway instance (cold start isolation)
        run: |
          curl -s -o /dev/null -w "%{http_code}" \
            https://player-api-tests-production.up.railway.app/api/automationTask/getAll
          sleep 5   # allow full warm-up

      - name: Run smoke test
        run: |
          jmeter -n \
            -t jmeter/test-plans/smoke.jmx \
            -q jmeter/properties/base.properties \
            -l results/smoke.jtl \
            -e -o reports/smoke/
        env:
          BASE_URL: player-api-tests-production.up.railway.app

      - name: Run baseline test (main only)
        if: github.ref == 'refs/heads/main'
        run: |
          jmeter -n \
            -t jmeter/test-plans/baseline.jmx \
            -q jmeter/properties/base.properties \
            -l results/baseline.jtl \
            -e -o reports/baseline/

      - name: Run stress test (main only, weekly)
        if: github.ref == 'refs/heads/main' && github.event_name == 'schedule'
        run: |
          jmeter -n \
            -t jmeter/test-plans/stress.jmx \
            -q jmeter/properties/base.properties \
            -l results/stress.jtl \
            -e -o reports/stress/

      - name: Upload JMeter HTML Dashboard
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: jmeter-dashboard
          path: reports/
          retention-days: 30

      - name: Deploy smoke report to GitHub Pages
        if: github.ref == 'refs/heads/main' && always()
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./reports/smoke
          destination_dir: report
```

---

## 9. Infrastructure Setup — Step by Step

### Step 1: Install JMeter locally

```bash
# macOS
brew install jmeter

# Linux / manual
wget https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-5.6.3.tgz
tar -xzf apache-jmeter-5.6.3.tgz
export PATH=$PATH:$(pwd)/apache-jmeter-5.6.3/bin

# Verify
jmeter --version   # 5.6.3
```

### Step 2: Create repo

```bash
mkdir player-api-performance && cd player-api-performance
git init

cat > .gitignore << 'EOF'
jmeter/results/
reports/
*.jtl
*.log
jmeter.log
EOF
```

### Step 3: Create properties and directory structure per Section 5

### Step 4: Generate JMX files per Section 6 + 7 structure

### Step 5: Create run scripts

```bash
# scripts/run-smoke.sh
#!/bin/bash
mkdir -p results reports/smoke
jmeter -n \
  -t jmeter/test-plans/smoke.jmx \
  -q jmeter/properties/base.properties \
  -l results/smoke.jtl \
  -e -o reports/smoke/
echo "Report: reports/smoke/index.html"
```

### Step 6: Test locally

```bash
# Wake Railway (cold start)
curl -s https://player-api-tests-production.up.railway.app/api/automationTask/getAll
sleep 5

# Run smoke
bash scripts/run-smoke.sh

# Open report
open reports/smoke/index.html   # macOS
# or: xdg-open reports/smoke/index.html
```

### Step 7: GitHub repository + Pages

```bash
git remote add origin https://github.com/YOUR_USERNAME/player-api-performance.git
# Enable Pages: Settings → Pages → gh-pages branch
```

---

## 10. FINDINGS.md — Required Content Template

```markdown
# Performance Findings — Player API (Railway Free Tier)

## Finding 1: Railway Cold Start

**Observed:** ~5 second latency on first request after inactivity
**Impact:** Smoke test warm-up request isolated this — excluded from measurements
**Mitigation:** curl wake-up step in CI before JMeter run

## Finding 2: ConcurrentDictionary Under Write Pressure

**Observed at:** 15+ concurrent users
**Symptom:** p99 increases disproportionately vs p95 (long tail appears)
**Root cause hypothesis:** ConcurrentDictionary.TryAdd() lock contention
  under concurrent writes from multiple threads
**Note:** This is expected behaviour for in-memory thread-safe collection
  under concurrent write pressure — not a bug

## Finding 3: Railway Free Tier Memory Ceiling

**Observed at:** 25-30 concurrent users (stress test)
**Symptom:** 502/503 responses begin appearing (~2-5% error rate)
**Root cause:** 512MB RAM ceiling on Railway free tier
**Portfolio significance:** Real degradation curve on real infrastructure —
  not a simulated bottleneck
```

---

## 11. Definition of Done

```
□ JMeter 5.6.3 installed and verified locally
□ All 3 JMX files generate valid HTML Dashboard locally
□ JWT extraction works — player_id populated, delete returns 204
□ FINDINGS.md written with observed Railway findings
□ CI pipeline created and smoke job is green
□ HTML Dashboard uploaded as CI artifact
□ README explains: enterprise stack, JWT flow, Railway degradation, JMeter rationale
□ Commit message: perf(jmeter): add Player API load tests with JWT auth flow
```

---

*End of CLAUDE.md*
*Version: 1.0 | Author: Evgenii Subbotin | Standalone: JMeter → Player API (Railway)*
*May 2026*
