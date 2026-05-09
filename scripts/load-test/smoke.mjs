#!/usr/bin/env node
// Simple autocannon load test for Aim Expense.
//
// Run before launch to validate the cache layer holds up under N concurrent
// users hitting list pages. By default targets the /login route (public) — for
// authed routes copy your `aim-session` cookie from a logged-in browser and
// pass via TARGET_COOKIE env var.
//
// Usage:
//   node scripts/load-test/smoke.mjs
//   TARGET_URL=http://localhost:3000/quotations TARGET_COOKIE='aim-session=...' DURATION=30 CONNECTIONS=50 node scripts/load-test/smoke.mjs

import autocannon from "autocannon";

const url = process.env.TARGET_URL || "http://localhost:3000/login";
const cookie = process.env.TARGET_COOKIE;
const duration = Number(process.env.DURATION || 20);
const connections = Number(process.env.CONNECTIONS || 50);
const pipelining = Number(process.env.PIPELINING || 1);

console.log(`▶ target:        ${url}`);
console.log(`▶ duration:      ${duration}s`);
console.log(`▶ connections:   ${connections}`);
console.log(`▶ pipelining:    ${pipelining}`);
if (cookie) console.log(`▶ cookie:        (set)`);
console.log("");

const headers = { accept: "text/html" };
if (cookie) headers.cookie = cookie;

const result = await autocannon({
  url,
  duration,
  connections,
  pipelining,
  headers,
});

console.log(autocannon.printResult(result));

const p95 = result.latency.p99 ?? result.latency.p975 ?? result.latency.p95;
const errors = (result.errors || 0) + (result.timeouts || 0);
const non2xx = (result.non2xx || 0);
const fivexx = result["5xx"] || 0;

console.log("");
console.log("───────── verdict ─────────");
console.log(`avg latency:   ${result.latency.average.toFixed(0)} ms`);
console.log(`p99 latency:   ${(p95 || 0).toFixed(0)} ms`);
console.log(`req/sec:       ${result.requests.average.toFixed(1)}`);
console.log(`errors:        ${errors}`);
console.log(`non-2xx:       ${non2xx}  5xx: ${fivexx}`);

const pass =
  fivexx === 0 &&
  errors === 0 &&
  result.latency.average < 1000 &&
  (p95 || 0) < 3000;

console.log(pass ? "✅ PASS (avg<1s, p99<3s, no 5xx)" : "❌ FAIL — review numbers above");
process.exit(pass ? 0 : 1);
