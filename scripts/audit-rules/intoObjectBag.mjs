import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const hotDirs = ["Libraries/Spatial", "Libraries/Physics", "Libraries/Navigation", "Libraries/Math", "Libraries/Viewport", "Libraries/Sandbox"];
const intoFnRe = /export (?:async )?function (\w*Into\w*)\s*\(([^)]*)\)/g;
const bagWriteRe = /\bout\.(?:x|y|minX|minY|maxX|maxY|col|row|cx|cy)\s*=/;

export const id = "into-object-bag";
export const description = "*Into* writers that mutate object bags (out.x / out.minX) instead of buf,o";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!hotDirs.some((d) => relPath.startsWith(`${d}/`))) continue;
        const src = fs.readFileSync(file, "utf8");
        intoFnRe.lastIndex = 0;
        let m;
        while ((m = intoFnRe.exec(src))) {
            const name = m[1];
            if (/F32$/i.test(name)) continue;
            const params = m[2];
            if (/^\s*buf\b/.test(params) || /,\s*o\b/.test(params) || /^\s*o\b/.test(params) && /\bbuf\b/.test(params)) continue;
            const start = m.index;
            const slice = src.slice(start, start + 800);
            if (!bagWriteRe.test(slice)) continue;
            const line = src.slice(0, start).split("\n").length;
            findings.push(issue(id, severity, relPath, name, line));
        }
    }
    return findings;
}
