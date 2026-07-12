import fs from "node:fs";
import { DELETED_PASSTHROUGH_EXPORTS, issue, rel } from "../audit-shared.mjs";

const MONOLITH_SCAN_ROOTS = [
    "Libraries/Sandbox/sandbox.js",
    "Libraries/Props/props.js",
    "Libraries/Physics/physics.js",
    "Libraries/Spatial/spatial.js",
    "Libraries/Navigation/navigation.js",
];

export const id = "deleted-passthrough";
export const description = "Deleted passthrough export symbols must not reappear in monolith modules";
export const severity = "fail";

function shouldScan(relPath) {
    if (MONOLITH_SCAN_ROOTS.includes(relPath)) return true;
    if (relPath.startsWith("GameState/") && relPath.endsWith(".js")) return true;
    if (relPath.startsWith("Libraries/") && relPath.endsWith(".js")) return true;
    return false;
}

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!shouldScan(relPath)) continue;
        const src = fs.readFileSync(file, "utf8");
        for (const name of DELETED_PASSTHROUGH_EXPORTS) {
            const re = new RegExp(`\\bexport\\s+(?:function|const|class|let|var)\\s+${name}\\b|\\bexport\\s*\\{[^}]*\\b${name}\\b`);
            if (!re.test(src)) continue;
            findings.push(issue(id, severity, relPath, `deleted passthrough ${name} reintroduced`));
        }
    }
    return findings;
}
