import fs from "node:fs";
import { LEGACY_SCALAR_SYMBOLS, issue, rel } from "../audit-shared.mjs";

export const id = "legacy-scalar-symbols";
export const description = "Legacy scalar/broadphase symbols that must stay removed";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/") && !relPath.startsWith("tests/")) continue;
        const src = fs.readFileSync(file, "utf8");
        for (const { pattern, label } of LEGACY_SCALAR_SYMBOLS) {
            if (!pattern.test(src)) continue;
            findings.push(issue(id, severity, relPath, `legacy scalar symbol: ${label}`));
        }
    }
    return findings;
}
