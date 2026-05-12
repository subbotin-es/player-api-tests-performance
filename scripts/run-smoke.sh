#!/bin/bash
set -e

mkdir -p results reports/smoke

echo "Waking Railway instance (cold start isolation)..."
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  https://player-api-tests-production.up.railway.app/api/automationTask/getAll || true
sleep 5

echo "Running smoke test (5 users, 30s)..."
jmeter -n \
  -t jmeter/test-plans/smoke.jmx \
  -q jmeter/properties/base.properties \
  -l results/smoke.jtl \
  -e -o reports/smoke/

echo "Done. Report: reports/smoke/index.html"
