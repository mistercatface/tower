import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const deletedExportRe = /export\s+function\s+(createWallFaceAxes|wallFaceColumns|wallPaintOptions|resolvePaintCellSize|paintBakeRequest)\b/;
const nestedPayloadRe = /payload\.p[12]\b/;
const paintOptionsBagRe = /\bpaintOptions\b|options\.isWall|options\.roofSurface|options\.p1x|writeWallCellPixel/;

function isHotBagReturn(line) {
    if (!/return\s*\{/.test(line)) return false;
    if (/wrappedP1|wrappedP2|startKey\s*:/.test(line)) return true;
    if (/dirX/.test(line) && /edgeLen/.test(line)) return true;
    if (/chunkSizePx/.test(line) && /minX/.test(line)) return true;
    if (/sideCanvas|capCanvas/.test(line)) return true;
    return false;
}

export const id = "world-surface-bags";
export const description = "WorldSurface typed diet — no hot XY/AABB bags, nested payload points, or deleted bag exports";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        const inWorldSurface = relPath.startsWith("Libraries/WorldSurface/");
        const inTileWorker = relPath === "Render/WorldSurface/TileSurfaceWorker.js";
        if (!inWorldSurface && !inTileWorker) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (inWorldSurface && /\.push\(\{/.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inWorldSurface && isHotBagReturn(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inWorldSurface && deletedExportRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inWorldSurface && /_wallChunkTextures|wallAtlasRevision/.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if (inWorldSurface && paintOptionsBagRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
            if ((inWorldSurface || inTileWorker) && nestedPayloadRe.test(line)) {
                findings.push(issue(id, severity, relPath, line.trim(), i + 1));
            }
        }
    }
    return findings;
}
