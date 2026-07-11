#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hotDirs = ["Libraries/Spatial", "Libraries/Physics", "Libraries/Navigation", "Libraries/Math", "Libraries/Viewport", "Libraries/Sandbox"];
const allowDirs = ["Libraries/Input", "Libraries/Procedural", "Libraries/Workers"];

const bannedExportRe = /^export (?:async )?(?:function|const|class) (\w+)/gm;
const scratchNameRe = /_SCRATCH$/;
const pairReturnRe = /return\s*\{\s*(?:x|y|x1|y1|col|row|minX|cx|desiredX|nx|worldX)\s*:/;
const f32AssignReboxRe = /\w+\s*=\s*\{\s*(?:x|y|x1|minX|desiredX)\s*:\s*ENGINE_F32\[/;
const intoBagWriteRe = /\bout\.(?:x|y|minX|minY|maxX|maxY|col|row|cx|cy)\s*=/;

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

function rel(p) {
    return path.relative(root, p).replace(/\\/g, "/");
}

function isAllowed(relPath) {
    return allowDirs.some((d) => relPath.startsWith(`${d}/`));
}

const warnings = [];
const failures = [];

for (const hot of hotDirs) {
    const dir = path.join(root, hot);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir, (p) => p.endsWith(".js"))) {
        const relPath = rel(file);
        if (isAllowed(relPath)) continue;
        const src = fs.readFileSync(file, "utf8");
        let m;
        bannedExportRe.lastIndex = 0;
        while ((m = bannedExportRe.exec(src))) {
            const name = m[1];
            if (scratchNameRe.test(name)) failures.push({ file: relPath, kind: "scratch-export", symbol: name });
            if (name.includes("Into")) {
                const fnStart = m.index;
                const slice = src.slice(fnStart, fnStart + 800);
                const sig = new RegExp(`export (?:async )?function ${name}\\(([^)]*)\\)`).exec(slice);
                const params = sig ? sig[1] : "";
                const bufO = /^\s*buf\b/.test(params) || /,\s*o\b/.test(params);
                if (!bufO && intoBagWriteRe.test(slice)) warnings.push({ file: relPath, kind: "into-object-bag", symbol: name });
                else if (sig && /^\s*out\b/.test(params)) warnings.push({ file: relPath, kind: "into-export", symbol: name });
            }
        }
        if (/\bconst [A-Z][A-Z0-9_]*_SCRATCH\b/.test(src)) warnings.push({ file: relPath, kind: "module-scratch", symbol: "const *_SCRATCH" });
        if (pairReturnRe.test(src)) warnings.push({ file: relPath, kind: "pair-return", symbol: "return { x|col|cx|desiredX|nx|worldX" });
        if (f32AssignReboxRe.test(src)) warnings.push({ file: relPath, kind: "f32-rebox", symbol: "= { x: ENGINE_F32[" });
        if (/\.push\(\{/.test(src)) warnings.push({ file: relPath, kind: "push-object", symbol: ".push({" });
    }
}

const legacy = [
    { pattern: /neighborGridDims/, label: "neighborGridDims" },
    { pattern: /gridToWorldByIdx/, label: "gridToWorldByIdx" },
    { pattern: /gridToWorldInCenteredFrame/, label: "gridToWorldInCenteredFrame" },
    { pattern: /worldToGridInCenteredFrame/, label: "worldToGridInCenteredFrame" },
    { pattern: /CARDINAL_OFFSETS/, label: "CARDINAL_OFFSETS" },
    { pattern: /gridSideOutwardVector/, label: "gridSideOutwardVector" },
    { pattern: /cellBoundsScratch/, label: "cellBoundsScratch" },
    { pattern: /ENTITY_AABB_SCRATCH/, label: "ENTITY_AABB_SCRATCH" },
    { pattern: /readSlabIntoBounds/, label: "readSlabIntoBounds" },
    { pattern: /\bSLAB_SCRATCH/, label: "SLAB_SCRATCH" },
    { pattern: /seenPrimaryScratch/, label: "seenPrimaryScratch" },
    { pattern: /wallBestScratch/, label: "wallBestScratch" },
    { pattern: /\bposScratch\b/, label: "posScratch" },
    { pattern: /COMPOUND_BOUNDS_SCRATCH/, label: "COMPOUND_BOUNDS_SCRATCH" },
    { pattern: /pairBroadphaseBoundsOverlap/, label: "pairBroadphaseBoundsOverlap" },
    { pattern: /\bpairBroadphaseOverlap\b/, label: "pairBroadphaseOverlap" },
    { pattern: /getBroadphaseBounds/, label: "getBroadphaseBounds" },
    { pattern: /writeBroadphaseFromBounds/, label: "writeBroadphaseFromBounds" },
    { pattern: /broadphaseBounds/, label: "broadphaseBounds" },
    { pattern: /getCircleSegmentPenetration/, label: "getCircleSegmentPenetration" },
    { pattern: /manifoldPoints/, label: "manifoldPoints" },
    { pattern: /\bboundsF32\b/, label: "boundsF32" },
    { pattern: /\bcircleInBoundsF32\b/, label: "circleInBoundsF32" },
    { pattern: /return \{ buf:/, label: "return { buf:" },
    { pattern: /\bscreenToWorld\(/, label: "screenToWorld(" },
    { pattern: /\bworldToScreen\(/, label: "worldToScreen(" },
    { pattern: /\bworldToScreenInto\b/, label: "worldToScreenInto" },
];

for (const { pattern, label } of legacy) {
    for (const hot of ["Libraries", "tests"]) {
        const dir = path.join(root, hot);
        if (!fs.existsSync(dir)) continue;
        for (const file of walk(dir, (p) => p.endsWith(".js"))) {
            const relPath = rel(file);
            if (label === "return { buf:" && !relPath.startsWith("Libraries/Viewport/")) continue;
            if ((label === "screenToWorld(" || label === "worldToScreen(" || label === "worldToScreenInto") && relPath !== "Libraries/Viewport/Viewport.js") continue;
            const src = fs.readFileSync(file, "utf8");
            if (pattern.test(src)) failures.push({ file: relPath, kind: "legacy", symbol: label });
        }
    }
}

if (warnings.length) {
    console.warn("audit-scalar-dialect warnings (baseline debt, not gated):\n");
    for (const row of warnings.sort((a, b) => a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol))) {
        console.warn(`  [${row.kind}] ${row.symbol}  in ${row.file}`);
    }
    console.warn(`\naudit-scalar-dialect: ${warnings.length} warning(s)\n`);
}

if (!failures.length) {
    console.log("audit-scalar-dialect: OK");
    process.exit(0);
}

console.error("audit-scalar-dialect failures:\n");
for (const row of failures.sort((a, b) => a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol))) {
    console.error(`  [${row.kind}] ${row.symbol}  in ${row.file}`);
}
console.error(`\naudit-scalar-dialect: ${failures.length} failure(s)`);
process.exit(1);
