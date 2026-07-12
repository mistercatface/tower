import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const bannedBagRe = /\bwallFaceScratch\b|\bsWallFaceColors\b|\bsWallBackFaceColors\b|\bsWallTopColors\b|\bsWallDrawOpts\b|\bsPrismOpts\b|\bSPHERE_PENDING_FILL\b|\bWALL_CHUNK_FALLBACK\b|\bpendingFill\b|\bWALL_FACE_ATLAS_SOLID\b|\bsWallBucketLookup\b|\bsGridStampHalfExtents\b|\bsGridStampStage\b/;
const overlayStringKeyRe = /`(?:r|d|cs|pd|pah|fda|we|gch)\$\{/;
const beltStripStringRe = /`p\$\{/;

export const id = "render-bags";
export const description = "Render/Canvas/Spatial typed diet — no face bags, pending fills, string overlay/stamp keys, or wall-bucket bags";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        const inRender = relPath.startsWith("Libraries/Render/");
        const inCanvas = relPath === "Libraries/Canvas/canvas.js";
        const inSpatial = relPath.startsWith("Libraries/Spatial/");
        if (!inRender && !inCanvas && !inSpatial) continue;
        const src = fs.readFileSync(file, "utf8");
        const lines = src.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if ((inRender || inSpatial || inCanvas) && bannedBagRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inRender && overlayStringKeyRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inRender && /\.push\(\{/.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inSpatial && beltStripStringRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
        }
        if (inCanvas && /\bOVERLAY_RENDER_KEY\s*=/.test(src)) {
            findings.push(issue(id, severity, relPath, "OVERLAY_RENDER_KEY object bag — use OVERLAY_RENDER_KEY_* bare ints", 1));
        }
        if (inCanvas && /GRID_STAMP_RENDER_KEY\s*=\s*\{/.test(src) && /FloorBelt:\s*["']/.test(src)) {
            findings.push(issue(id, severity, relPath, "GRID_STAMP_RENDER_KEY string family — use GRID_STAMP_RENDER_KEY_* bare ints", 1));
        }
    }
    return findings;
}
