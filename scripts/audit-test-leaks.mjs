#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libsDir = path.join(root, "Libraries");
const testsDir = path.join(root, "tests");
const prodRoots = ["Apps", "Assets", "GameState", "Libraries", "Config", "Core"];

const exportRe = /^export (?:async )?(?:function|const|class) (\w+)/gm;
const forTestsNameRe = /ForTests?$/;
const importNamedRe = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
const importDefaultRe = /import\s+(\w+)\s+from\s*["']([^"']+)["']/g;
const mockFnRe = /^function (mock\w+|createMock\w*)\s*\(/gm;

function walk(dir, pred) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            out.push(...walk(p, pred));
        } else if (pred(p)) out.push(p);
    }
    return out;
}

function libraryExports() {
    const map = new Map();
    for (const file of walk(libsDir, (p) => p.endsWith(".js"))) {
        const src = fs.readFileSync(file, "utf8");
        let m;
        while ((m = exportRe.exec(src))) {
            const list = map.get(m[1]) ?? [];
            list.push(path.relative(root, file));
            map.set(m[1], list);
        }
    }
    return map;
}

function collectImports(file) {
    const src = fs.readFileSync(file, "utf8");
    const imports = [];
    let m;
    while ((m = importNamedRe.exec(src))) {
        const from = m[2];
        for (const part of m[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (name) imports.push({ name, from, file });
        }
    }
    while ((m = importDefaultRe.exec(src))) {
        imports.push({ name: m[1], from: m[2], file, default: true });
    }
    return imports;
}

function isTestFile(file) {
    return file.replace(/\\/g, "/").includes("/tests/");
}

function isProdConsumer(file) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (isTestFile(rel)) return false;
    return prodRoots.some((r) => rel.startsWith(`${r}/`) || rel === r);
}

function resolveImport(from, importer) {
    if (from.startsWith(".")) return path.normalize(path.join(path.dirname(importer), from));
    return from;
}

function importsLibrary(file, from) {
    const resolved = resolveImport(from, file);
    const rel = path.relative(root, resolved).replace(/\\/g, "/");
    return rel.startsWith("Libraries/") || from.includes("/Libraries/");
}

const exports = libraryExports();
const allJs = walk(root, (p) => p.endsWith(".js") && !p.includes("node_modules"));
const importRecords = [];
for (const file of allJs) {
    for (const rec of collectImports(file)) {
        if (!importsLibrary(file, rec.from)) continue;
        importRecords.push({ ...rec, file: path.relative(root, file).replace(/\\/g, "/") });
    }
}

const leaks = [];
const forbiddenExports = [];
for (const [symbol, defFiles] of exports) {
    if (forTestsNameRe.test(symbol)) {
        forbiddenExports.push({ symbol, defFiles });
        continue;
    }
    const users = importRecords.filter((r) => !r.default && r.name === symbol);
    if (users.length === 0) continue;
    const testUsers = users.filter((u) => isTestFile(u.file));
    const prodUsers = users.filter((u) => isProdConsumer(u.file));
    if (testUsers.length > 0 && prodUsers.length === 0) {
        leaks.push({ symbol, defFiles, testUsers: testUsers.map((u) => u.file) });
    }
}

const inlineMocks = [];
for (const file of walk(testsDir, (p) => p.endsWith(".test.js"))) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    const src = fs.readFileSync(file, "utf8");
    let m;
    while ((m = mockFnRe.exec(src))) inlineMocks.push({ file: rel, fn: m[1] });
}

let failed = false;
if (forbiddenExports.length) {
    failed = true;
    console.error("Forbidden ForTests export names in Libraries/:\n");
    for (const row of forbiddenExports.sort((a, b) => a.symbol.localeCompare(b.symbol))) {
        console.error(`  ${row.symbol}  (${row.defFiles.join(", ")})`);
    }
    console.error("");
}
if (leaks.length) {
    failed = true;
    console.error("Test-only library exports (imported from tests/, never from production):\n");
    for (const leak of leaks.sort((a, b) => a.symbol.localeCompare(b.symbol))) {
        console.error(`  ${leak.symbol}  (${leak.defFiles.join(", ")})`);
        for (const f of [...new Set(leak.testUsers)].sort()) console.error(`    tests: ${f}`);
    }
    console.error("");
}

if (inlineMocks.length) {
    failed = true;
    console.error("Inline mock factories in test files (move to tests/harness/):\n");
    for (const row of inlineMocks.sort((a, b) => a.file.localeCompare(b.file))) {
        console.error(`  ${row.fn}  in ${row.file}`);
    }
    console.error("");
}

if (!failed) {
    console.log("audit-test-leaks: OK");
    process.exit(0);
}
console.error(`audit-test-leaks: ${forbiddenExports.length} forbidden name(s), ${leaks.length} export leak(s), ${inlineMocks.length} inline mock(s)`);
process.exit(1);
