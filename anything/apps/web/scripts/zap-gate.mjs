#!/usr/bin/env node
/**
 * ZAP baseline gate (S15) — enforces TENANT_GUARDRAIL §7's "ZAP baseline:
 * 0 High/Medium" against the JSON report from zap-baseline.py.
 *
 *   node scripts/zap-gate.mjs <path-to-zap.json>
 *
 * Exit 1 on ANY High/Medium alert that is not on the ACCEPTED list below.
 * Acceptance is per (pluginid + name substring) with the reason on the
 * record — rule-level ignores in ZAP's own config would silence a whole
 * plugin (e.g. every CSP finding), which is exactly the blind spot this
 * gate exists to avoid.
 */

import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('usage: node scripts/zap-gate.mjs <zap.json>');
  process.exit(2);
}

/**
 * Accepted risks — each entry names WHY. Keep this list short and honest:
 * every addition is a security decision that belongs in PR review.
 */
const ACCEPTED = [
  {
    pluginid: '10055',
    nameIncludes: 'style-src unsafe-inline',
    reason:
      "CSP style-src 'unsafe-inline' is the deliberate Tailwind/Next posture " +
      '(security-headers.js): script-src is nonce + strict-dynamic, so style ' +
      'injection cannot become script execution. Revisit if Next ships nonce ' +
      'support for its inline styles.',
  },
];

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const sites = Array.isArray(report.site) ? report.site : [report.site].filter(Boolean);
const alerts = sites.flatMap((site) => site?.alerts ?? []);

// riskcode: 3 = High, 2 = Medium, 1 = Low, 0 = Informational.
const consequential = alerts.filter((alert) => Number(alert.riskcode) >= 2);
const informational = alerts.filter((alert) => Number(alert.riskcode) < 2);

const failures = [];
for (const alert of consequential) {
  const accepted = ACCEPTED.find(
    (entry) =>
      entry.pluginid === String(alert.pluginid) &&
      String(alert.name ?? alert.alert ?? '').includes(entry.nameIncludes)
  );
  if (accepted) {
    console.log(`ACCEPTED  [${alert.riskdesc}] ${alert.name ?? alert.alert} — ${accepted.reason}`);
  } else {
    failures.push(alert);
  }
}

for (const alert of informational) {
  console.log(`info/low  [${alert.riskdesc}] ${alert.name ?? alert.alert}`);
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} unaccepted High/Medium ZAP alert(s):`);
  for (const alert of failures) {
    console.error(
      `  [${alert.riskdesc}] ${alert.name ?? alert.alert} (plugin ${alert.pluginid})\n` +
        `    ${String(alert.desc ?? '').replace(/<[^>]+>/g, '').slice(0, 300)}\n` +
        `    instances: ${(alert.instances ?? []).length}`
    );
  }
  console.error(
    '\nFix the finding, or — if it is a genuinely accepted risk — add it to ACCEPTED in ' +
      'scripts/zap-gate.mjs with the reason, in a reviewed PR.'
  );
  process.exit(1);
}

console.log(`\n✓ ZAP baseline: 0 unaccepted High/Medium (${alerts.length} total alerts inspected)`);
