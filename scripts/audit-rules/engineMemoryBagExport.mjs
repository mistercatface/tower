import fs from "node:fs";
import path from "node:path";
import { issue, rel } from "../audit-shared.mjs";

const ALLOWED_BAG_EXPORTS = new Set([
    "kineticDynamicSlab",
    "kineticStaticSlab",
    "kineticConstraintStore",
    "kineticConstraintSlab",
    "kineticContactBuffer",
    "kineticPairBuffer",
    "persistedKineticPairBuffer",
    "kineticDebrisSlab",
    "deferredFractureSlab",
    "primitivePhysics",
    "pendingWallBreaks",
    "wallSpawnScratch",
    "staticWallSegmentSlab",
    "warmStartState",
    "pairHashState",
]);

const bagExportRe = /^export const (\w+)\s*=\s*\{/gm;
const xyBagRe = /^export const (\w+)\s*=\s*\{\s*(?:x|y|minX|col)\s*:/gm;
const bagFactoryRe = /^export function create\w*(?:Point|Vec|Aabb|Bounds)\s*\(\s*\)\s*\{\s*return\s*\{/gm;

export const id = "engine-memory-bag-export";
export const description = "New object-bag exports from Core/engineMemory.js (XY/AABB fail; unknown SoA bags warn)";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    const file = path.join(ctx.root, "Core/engineMemory.js");
    if (!fs.existsSync(file)) return findings;
    const src = fs.readFileSync(file, "utf8");
    const relPath = rel(ctx.root, file);

    xyBagRe.lastIndex = 0;
    let m;
    while ((m = xyBagRe.exec(src))) {
        const name = m[1];
        if (ALLOWED_BAG_EXPORTS.has(name)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        findings.push(issue(id, "fail", relPath, `XY/AABB bag export ${name}`, line));
    }
    bagFactoryRe.lastIndex = 0;
    while ((m = bagFactoryRe.exec(src))) {
        const line = src.slice(0, m.index).split("\n").length;
        findings.push(issue(id, "fail", relPath, m[0].slice(0, 80), line));
    }
    bagExportRe.lastIndex = 0;
    while ((m = bagExportRe.exec(src))) {
        const name = m[1];
        if (ALLOWED_BAG_EXPORTS.has(name)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        findings.push(issue(id, "warn", relPath, `unallowlisted bag export ${name}`, line));
    }
    return findings;
}
