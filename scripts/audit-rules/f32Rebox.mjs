import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const hotDirs = ["Libraries/Spatial", "Libraries/Physics", "Libraries/Navigation", "Libraries/Math", "Libraries/Viewport", "Libraries/Sandbox"];
const reboxRe = /\{\s*(?:x|y|x1|y1|minX|maxX|col|row|desiredX|desiredY|cx|cy)\s*:\s*ENGINE_F32\[/;

export const id = "f32-rebox";
export const description = "Reboxing ENGINE_F32 slots into { x, y } / AABB bags";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!hotDirs.some((d) => relPath.startsWith(`${d}/`))) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!reboxRe.test(lines[i])) continue;
            findings.push(issue(id, severity, relPath, lines[i].trim(), i + 1));
        }
    }
    return findings;
}
