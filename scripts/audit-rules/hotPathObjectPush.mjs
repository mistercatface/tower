import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const hotDirs = [
    "Libraries/Spatial",
    "Libraries/Physics",
    "Libraries/Navigation",
    "Libraries/Math",
    "Libraries/Viewport",
    "Libraries/Sandbox",
];

export const id = "hot-path-object-push";
export const description = ".push({ inline object allocation in hot-path libraries";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!hotDirs.some((d) => relPath.startsWith(`${d}/`))) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!/\.push\(\{/.test(lines[i])) continue;
            findings.push(issue(id, severity, relPath, lines[i].trim(), i + 1));
        }
    }
    return findings;
}
