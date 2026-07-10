import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const appImportRe = /from\s+["'](?:\.\.\/)*Apps\//;

export const id = "library-imports-app";
export const description = "Libraries/ must not import from Apps/ (layer violation)";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!appImportRe.test(lines[i])) continue;
            findings.push(issue(id, severity, relPath, lines[i].trim(), i + 1));
        }
    }
    return findings;
}
