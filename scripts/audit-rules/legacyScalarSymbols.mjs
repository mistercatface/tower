import fs from "node:fs";
import { LEGACY_SCALAR_SYMBOLS, issue, rel } from "../audit-shared.mjs";

export const id = "legacy-scalar-symbols";
export const description = "Legacy scalar/broadphase/viewport symbols that must stay removed";
export const severity = "fail";

function matchesScope(entry, relPath) {
    if (entry.onlyFile) return relPath === entry.onlyFile;
    if (entry.onlyUnder) return relPath.startsWith(entry.onlyUnder);
    return relPath.startsWith("Libraries/") || relPath.startsWith("tests/");
}

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        const src = fs.readFileSync(file, "utf8");
        for (const entry of LEGACY_SCALAR_SYMBOLS) {
            if (!matchesScope(entry, relPath)) continue;
            if (!entry.pattern.test(src)) continue;
            findings.push(issue(id, severity, relPath, `legacy scalar symbol: ${entry.label}`));
        }
    }
    return findings;
}
