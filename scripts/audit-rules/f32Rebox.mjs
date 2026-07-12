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
const reboxRe = /\{\s*(?:x|y|x1|y1|minX|maxX|col|row|desiredX|desiredY|cx|cy)\s*:\s*ENGINE_F32\[/;
const moduleScratchRe = /\bconst [A-Z][A-Z0-9_]*_SCRATCH\b/;
const pairReturnRe = /return\s*\{\s*(?:x|y|x1|y1|col|row|minX|cx|desiredX|nx|worldX)\s*:/;

export const id = "f32-rebox";
export const description = "F32 rebox, module *_SCRATCH, and pair-return object bags in hot-path libraries";
export const severity = "warn";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (!hotDirs.some((d) => relPath.startsWith(`${d}/`))) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (reboxRe.test(line)) {
                findings.push(issue(id, severity, relPath, `f32-rebox: ${line.trim()}`, i + 1));
            }
            if (moduleScratchRe.test(line)) {
                findings.push(issue(id, severity, relPath, `module-scratch: ${line.trim()}`, i + 1));
            }
            if (pairReturnRe.test(line)) {
                findings.push(issue(id, severity, relPath, `pair-return: ${line.trim()}`, i + 1));
            }
        }
    }
    return findings;
}
