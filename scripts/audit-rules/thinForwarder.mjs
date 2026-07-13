import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

/** Builtins / language helpers — wrapping these is not the passthrough smell we care about. */
const SKIP_CALLEES = new Set(["Math", "JSON", "Object", "Number", "String", "Array", "Boolean", "console", "performance"]);

const exportFnOpenRe = /^export function (\w+)\([^)]*\)\s*\{\s*$/;
const exportFnOneLineRe = /^export function (\w+)\([^)]*\)\s*\{\s*(return .+;)\s*\}\s*$/;

function classifyForward(calleeExpr) {
    const parts = calleeExpr.split(".");
    if (SKIP_CALLEES.has(parts[0])) return null;
    if (parts.length === 1) return { kind: "bare", callee: parts[0] };
    return { kind: "member", callee: calleeExpr };
}

/** Single call only — reject || / && / ?: or anything after the matched call closes. */
function parseSingleReturnCall(returnStmt) {
    const s = returnStmt.trim();
    if (!s.startsWith("return ")) return null;
    let i = 7;
    while (i < s.length && /\s/.test(s[i])) i++;
    const start = i;
    if (!/[A-Za-z_$]/.test(s[i])) return null;
    while (i < s.length && /[\w.$]/.test(s[i])) i++;
    const callee = s.slice(start, i);
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== "(") return null;
    let depth = 0;
    for (; i < s.length; i++) {
        const c = s[i];
        if (c === "(") depth++;
        else if (c === ")") {
            depth--;
            if (depth === 0) {
                i++;
                break;
            }
        }
    }
    if (depth !== 0) return null;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== ";") return null;
    i++;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i !== s.length) return null;
    return callee;
}

export const id = "thin-forwarder";
export const description = "Exported functions whose body only forwards to another call (Libraries/ + GameState/)";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!relPath.startsWith("Libraries/") && !relPath.startsWith("GameState/")) continue;
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();
            const one = line.match(exportFnOneLineRe);
            if (one) {
                const callee = parseSingleReturnCall(one[2]);
                if (callee) {
                    const classified = classifyForward(callee);
                    if (classified) findings.push(issue(id, severity, relPath, `${one[1]} forwards to ${classified.callee}`, i + 1));
                }
                continue;
            }
            const open = line.match(exportFnOpenRe);
            if (!open) continue;
            const next = (lines[i + 1] || "").trim();
            const close = (lines[i + 2] || "").trim();
            if (close !== "}") continue;
            const callee = parseSingleReturnCall(next);
            if (!callee) continue;
            const classified = classifyForward(callee);
            if (classified) findings.push(issue(id, severity, relPath, `${open[1]} forwards to ${classified.callee}`, i + 1));
        }
    }
    return findings;
}
