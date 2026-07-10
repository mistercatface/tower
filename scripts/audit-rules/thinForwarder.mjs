import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const forwarderRe = /^export function (\w+)\([^)]*\)\s*\{\s*return (\w+)\([^)]*\);\s*\}\s*$/;

export const id = "thin-forwarder";
export const description = "Exported one-line forwarders (export function f() { return g(); })";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(forwarderRe);
            if (!m) continue;
            findings.push(issue(id, severity, relPath, `${m[1]} forwards to ${m[2]}`, i + 1));
        }
    }
    return findings;
}
