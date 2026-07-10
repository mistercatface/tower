import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const reexportRe = /^\s*export\s+\{[^}]+\}\s+from\s+["']/m;

export const id = "reexport-barrel";
export const description = "Libraries/ must not re-export from other modules (except index.js package boundaries — warn only)";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const src = fs.readFileSync(file, "utf8");
        if (!reexportRe.test(src)) continue;
        const line = src.split("\n").findIndex((row) => reexportRe.test(row)) + 1;
        const isIndex = relPath.endsWith("/index.js") || relPath.endsWith("\\index.js");
        findings.push(issue(id, isIndex ? "warn" : severity, relPath, "re-export barrel line", line || null));
    }
    return findings;
}
