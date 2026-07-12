import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const bannedBagRe = /\bwallFaceScratch\b|\bsWallFaceColors\b|\bsWallBackFaceColors\b|\bsWallTopColors\b|\bsWallDrawOpts\b|\bsPrismOpts\b/;
const overlayStringKeyRe = /`(?:r|d|cs|pd|pah|fda|we|gch)\$\{/;

export const id = "render-bags";
export const description = "Render typed diet — no wallFaceScratch bags, nested wall color opts, or string overlay cache keys";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        const inRender = relPath.startsWith("Libraries/Render/");
        const inCanvas = relPath === "Libraries/Canvas/canvas.js";
        if (!inRender && !inCanvas) continue;
        const src = fs.readFileSync(file, "utf8");
        const lines = src.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (inRender && bannedBagRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inRender && overlayStringKeyRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inRender && /\.push\(\{/.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
        }
        if (inCanvas && /\bOVERLAY_RENDER_KEY\s*=/.test(src)) {
            findings.push(issue(id, severity, relPath, "OVERLAY_RENDER_KEY object bag — use OVERLAY_RENDER_KEY_* bare ints", 1));
        }
    }
    return findings;
}
