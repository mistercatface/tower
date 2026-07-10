import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

export const id = "inner-jsdoc-tags";
export const description = "No @type / @param / @returns inside function bodies in Libraries/";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!/^\s+\/\*\*/.test(line)) continue;
            if (!/@(type|param|returns)\b/.test(line)) continue;
            if (/^\s{4,}/.test(line)) {
                findings.push(issue(id, severity, relPath, "inner JSDoc @ tag", i + 1));
            }
        }
    }
    return findings;
}
