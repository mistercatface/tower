import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

/** Builtins / language helpers — wrapping these is not the passthrough smell we care about. */
const SKIP_CALLEES = new Set(["Math", "JSON", "Object", "Number", "String", "Array", "Boolean", "console", "performance"]);

const exportFnOpenRe = /^export function (\w+)\([^)]*\)\s*\{\s*$/;
const exportFnOneLineRe = /^export function (\w+)\([^)]*\)\s*\{\s*return (.+);\s*\}\s*$/;
const returnCallRe = /^return ((?:\w+\.)*\w+)\([^;]*\);?\s*$/;

function classifyForward(calleeExpr) {
    const parts = calleeExpr.split(".");
    if (SKIP_CALLEES.has(parts[0])) return null;
    if (parts.length === 1) return { kind: "bare", callee: parts[0] };
    return { kind: "member", callee: calleeExpr };
}

export const id = "thin-forwarder";
export const description = "Exported functions whose body only forwards to another call (incl. receiver.method)";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();
            const one = line.match(exportFnOneLineRe);
            if (one) {
                const ret = returnCallRe.exec(`return ${one[2].trim()}`);
                if (ret) {
                    const classified = classifyForward(ret[1]);
                    if (classified) findings.push(issue(id, severity, relPath, `${one[1]} forwards to ${classified.callee}`, i + 1));
                }
                continue;
            }
            const open = line.match(exportFnOpenRe);
            if (!open) continue;
            const next = (lines[i + 1] || "").trim();
            const close = (lines[i + 2] || "").trim();
            if (close !== "}") continue;
            const ret = returnCallRe.exec(next);
            if (!ret) continue;
            const classified = classifyForward(ret[1]);
            if (classified) findings.push(issue(id, severity, relPath, `${open[1]} forwards to ${classified.callee}`, i + 1));
        }
    }
    return findings;
}
