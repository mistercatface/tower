import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const hotDirs = [
    "Libraries/Spatial",
    "Libraries/Physics",
    "Libraries/Navigation",
    "Libraries/Math",
    "Libraries/Viewport",
    "Libraries/Sandbox",
    "Libraries/Render",
];
const allowDirs = ["Libraries/Input", "Libraries/Procedural", "Libraries/Workers"];
const exportRe = /^export (?:async )?(?:function|const|class) (\w+)/gm;
const scratchNameRe = /_SCRATCH$/;

export const id = "scratch-export";
export const description = "No export of *_SCRATCH symbols from hot-path libraries";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!hotDirs.some((d) => relPath.startsWith(`${d}/`))) continue;
        if (allowDirs.some((d) => relPath.startsWith(`${d}/`))) continue;
        const src = fs.readFileSync(file, "utf8");
        exportRe.lastIndex = 0;
        let m;
        while ((m = exportRe.exec(src))) {
            if (!scratchNameRe.test(m[1])) continue;
            const line = src.slice(0, m.index).split("\n").length;
            findings.push(issue(id, severity, relPath, `scratch export: ${m[1]}`, line));
        }
    }
    return findings;
}
