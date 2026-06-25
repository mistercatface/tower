#!/usr/bin/env node
/**
 * Always run tests with preload + 5s timeout so hangs fail instead of blocking CI/agents.
 *
 * Usage:
 *   node scripts/run-tests.mjs                    # all tests under tests/
 *   node scripts/run-tests.mjs tests/foo.test.js  # one file
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userArgs = process.argv.slice(2);
const testTargets = userArgs.length ? userArgs : ["tests/**/*.test.js"];

const result = spawnSync(process.execPath, ["--import", "./tests/testPreload.js", "--test", "--test-timeout=5000", ...testTargets], { cwd: repoRoot, stdio: "inherit" });

process.exit(result.status ?? 1);
