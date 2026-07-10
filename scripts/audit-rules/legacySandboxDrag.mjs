import fs from "node:fs";
import { LEGACY_SANDBOX_DRAG_PATTERNS, issue, rel } from "../audit-shared.mjs";

export const id = "legacy-sandbox-drag";
export const description = "Removed sandbox drag-overhaul symbols must stay gone";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        const isAsset = relPath.startsWith("Assets/props/") && relPath.endsWith(".asset.js");
        const isLib = relPath.startsWith("Libraries/");
        if (!isAsset && !isLib) continue;
        const src = fs.readFileSync(file, "utf8");
        for (const { pattern, label } of LEGACY_SANDBOX_DRAG_PATTERNS) {
            if (!pattern.test(src)) continue;
            if (label === "sandbox.behaviors array in asset" && !isAsset) continue;
            findings.push(issue(id, severity, relPath, `legacy pattern: ${label}`));
        }
    }
    return findings;
}
