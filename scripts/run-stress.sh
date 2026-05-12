#!/bin/bash
set -e

mkdir -p results reports/stress

echo "Waking Railway instance (cold start isolation)..."
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  https://player-api-tests-production.up.railway.app/api/automationTask/getAll || true
sleep 5

echo "Running stress test (5→15→30 users, 120s total)..."
jmeter -n \
  -t jmeter/test-plans/stress.jmx \
  -q jmeter/properties/base.properties \
  -l results/stress.jtl \
  -e -o reports/stress/

echo "Done. Report: reports/stress/index.html"
