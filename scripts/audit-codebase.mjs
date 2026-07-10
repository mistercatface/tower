#!/usr/bin/env node
/**
 * Codebase hygiene audit — extend via scripts/audit-rules/*.mjs
 *
 * Usage:
 *   node scripts/audit-codebase.mjs [--warn] [--json] [path-filter...]
 *
 * Related: audit-test-leaks.mjs, audit-scalar-dialect.mjs, tests/passthroughGuard.test.js
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectJsFiles } from "./audit-shared.mjs";
import { rules } from "./audit-rules/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const showHelp = args.includes("--help") || args.includes("-h");
const showWarnings = args.includes("--warn");
const jsonOutput = args.includes("--json");
const pathFilters = args.filter((a) => !a.startsWith("-"));

if (showHelp) {
    console.log(`audit-codebase — codebase hygiene checks

Usage:
  node scripts/audit-codebase.mjs [--warn] [--json] [path-filter...]

Options:
  --warn       Include warning-severity findings (default: failures only)
  --json       Machine-readable output
  --help, -h   This help

Related:
  npm run audit:all          test-leaks + scalar-dialect + codebase
  tests/passthroughGuard.test.js

Rules (${rules.length}):
${rules.map((r) => `  ${r.id} (${r.severity}) — ${r.description}`).join("\n")}
`);
    process.exit(0);
}

function collectScopedFiles() {
    if (pathFilters.length === 0) return collectJsFiles(root);
    const merged = new Map();
    for (const filter of pathFilters) {
        for (const file of collectJsFiles(root, filter)) merged.set(file, true);
    }
    return [...merged.keys()];
}

function groupBySeverity(findings) {
    const fails = findings.filter((f) => f.severity === "fail");
    const warns = findings.filter((f) => f.severity === "warn");
    return { fails, warns };
}

function printHuman(findings, label) {
    if (findings.length === 0) return;
    console.error(`${label}:\n`);
    const byRule = new Map();
    for (const f of findings) {
        const list = byRule.get(f.ruleId) ?? [];
        list.push(f);
        byRule.set(f.ruleId, list);
    }
    for (const [ruleId, list] of [...byRule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        console.error(`  [${ruleId}]`);
        for (const f of list.sort((a, b) => a.file.localeCompare(b.file))) {
            const loc = f.line != null ? `:${f.line}` : "";
            console.error(`    ${f.file}${loc}  ${f.message}`);
        }
    }
    console.error("");
}

const ctx = { root, files: collectScopedFiles() };
const allFindings = [];
for (const rule of rules) {
    const findings = rule.run(ctx);
    for (const f of findings) allFindings.push(f);
}

const { fails, warns } = groupBySeverity(allFindings);

if (jsonOutput) {
    console.log(JSON.stringify({ fails, warns: showWarnings ? warns : [] }, null, 2));
} else {
    printHuman(fails, "audit-codebase failures");
    if (showWarnings) printHuman(warns, "audit-codebase warnings");
    if (fails.length === 0 && (!showWarnings || warns.length === 0)) {
        console.log(`audit-codebase: OK (${ctx.files.length} files scanned, ${rules.length} rules)`);
    } else if (fails.length === 0) {
        console.log(`audit-codebase: OK — ${warns.length} warning(s) with --warn (${ctx.files.length} files)`);
    } else {
        console.error(`audit-codebase: ${fails.length} failure(s)${showWarnings ? `, ${warns.length} warning(s)` : ""}`);
    }
}

process.exit(fails.length > 0 ? 1 : 0);
