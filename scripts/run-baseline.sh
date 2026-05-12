#!/bin/bash
set -e

mkdir -p results reports/baseline

echo "Waking Railway instance (cold start isolation)..."
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  https://player-api-tests-production.up.railway.app/api/automationTask/getAll || true
sleep 5

echo "Running baseline test (10 users, 60s)..."
jmeter -n \
  -t jmeter/test-plans/baseline.jmx \
  -q jmeter/properties/base.properties \
  -l results/baseline.jtl \
  -e -o reports/baseline/

echo "Done. Report: reports/baseline/index.html"
