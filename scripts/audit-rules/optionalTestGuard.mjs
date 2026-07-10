import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const guardRes = [
    /\bif\s*\(\s*!state\s*\)/,
    /\bif\s*\(\s*opts\s*===\s*undefined/,
    /\bif\s*\(\s*opts\s*==\s*null/,
    /\?\?\s*null\b/,
    /\?\?\s*\{\}/,
    /\bif\s*\(\s*test\s*\)/,
    /\bif\s*\(\s*process\.env\.NODE_ENV/,
];

export const id = "optional-test-guard";
export const description = "Optional guards / null fallbacks in Libraries/ (possible test-support paths)";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith("//")) continue;
            for (const re of guardRes) {
                if (!re.test(line)) continue;
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
                break;
            }
        }
    }
    return findings;
}
