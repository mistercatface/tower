import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const hotDirs = ["Libraries/Spatial", "Libraries/Physics", "Libraries/Navigation", "Libraries/Math", "Libraries/Viewport", "Libraries/Render"];
const exportFnRe = /export (?:async )?function (\w+)\b/g;

export const id = "dual-bag-f32-api";
export const description = "Dual bag + F32 APIs (foo and fooF32 / object fooInto both exported)";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!hotDirs.some((d) => relPath.startsWith(`${d}/`))) continue;
        const src = fs.readFileSync(file, "utf8");
        const names = new Set();
        exportFnRe.lastIndex = 0;
        let m;
        while ((m = exportFnRe.exec(src))) names.add(m[1]);
        for (const name of names) {
            if (!name.endsWith("F32")) continue;
            const bare = name.slice(0, -3);
            if (!bare) continue;
            if (names.has(bare) || names.has(`${bare}Into`)) {
                findings.push(issue(id, severity, relPath, `${bare} + ${name}`, null));
            }
        }
    }
    return findings;
}
