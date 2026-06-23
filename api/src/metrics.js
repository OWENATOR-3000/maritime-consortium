'use strict';

// In-memory request metrics. Deliberately separate from server.js so the
// HTTP server only needs to call recordRequest() once per response — it
// doesn't need to know anything about how stats are stored or aggregated.
// Metrics reset on API restart; this is a live-usage view, not a
// historical store (the Caliper benchmark results in Table 6.1 remain the
// authoritative load-test figures — this complements them with real traffic).

const stats = new Map(); // key: "METHOD normalizedPath" -> entry
const startedAt = Date.now();

// Path segments that are part of the route shape, not a variable ID.
// Anything else (a shipment ID, document ID, proposal ID, MSP ID, etc.)
// is collapsed to ":id" so requests to the same endpoint group together.
const STATIC_SEGMENTS = new Set([
  '', 'shipments', 'commercial-details', 'clearance', 'approve', 'finalize',
  'documents', 'upload', 'verify', 'governance', 'proposals', 'vote',
  'members', 'membership', 'request', 'audit', 'compliance', 'flag',
  'resolve', 'disputes', 'respond', 'health', 'metrics'
]);

function normalizePath(pathname) {
  return pathname
    .split('/')
    .map((segment) => (STATIC_SEGMENTS.has(segment) ? segment : ':id'))
    .join('/');
}

function recordRequest(method, pathname, statusCode, durationMs) {
  const path = normalizePath(pathname);
  const key = `${method} ${path}`;

  if (!stats.has(key)) {
    stats.set(key, { method, path, count: 0, totalMs: 0, errorCount: 0, recentMs: [] });
  }

  const entry = stats.get(key);
  entry.count += 1;
  entry.totalMs += durationMs;
  if (statusCode >= 400) entry.errorCount += 1;
  entry.recentMs.push(durationMs);
  if (entry.recentMs.length > 10) entry.recentMs.shift();
}

function snapshot() {
  const routes = Array.from(stats.values())
    .map((e) => ({
      method: e.method,
      path: e.path,
      count: e.count,
      errorCount: e.errorCount,
      avgLatencyMs: Math.round((e.totalMs / e.count) * 10) / 10,
      recentLatenciesMs: e.recentMs
    }))
    .sort((a, b) => b.count - a.count);

  const totalRequests = routes.reduce((sum, r) => sum + r.count, 0);
  const totalErrors = routes.reduce((sum, r) => sum + r.errorCount, 0);

  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    totalRequests,
    totalErrors,
    routes
  };
}

module.exports = { recordRequest, snapshot, normalizePath };
