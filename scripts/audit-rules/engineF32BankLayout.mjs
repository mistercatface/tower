import fs from "node:fs";
import { issue, rel } from "../audit-shared.mjs";

const MEMORY_FILE = "Core/engineMemory.js";
const layoutExportRe = /^export const ((?:P_VEC_|P_OUT_|P_SAT|P_CLIP_|P_AABB_|P_PROJ_|P_WALL_|M_OUT_|M_VEC_|S_OUT_|S_AABB|S_QUAD|S_EDGE_|F_OUT_|F_VEC_|F_EDGE_|F_SHATTER_|N_OUT_|G_W|G_L|G_O|R_QUAD_|R_SUBDIV|R_CAP_|R_CHEVRON|R_FACE_|R_SPRITE_)\w*)\s*=\s*ENGINE_/gm;

export const id = "engine-f32-bank-layout";
export const description = "ENGINE_F32 bank slot consts must live only in Core/engineMemory.js";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
        const relPath = rel(ctx.root, file);
        if (relPath === MEMORY_FILE || relPath.replace(/\\/g, "/") === MEMORY_FILE) continue;
        if (!relPath.startsWith("Libraries/") && !relPath.startsWith("GameState/") && !relPath.startsWith("Apps/") && !relPath.startsWith("Core/")) continue;
        const src = fs.readFileSync(file, "utf8");
        layoutExportRe.lastIndex = 0;
        let m;
        while ((m = layoutExportRe.exec(src))) {
            const line = src.slice(0, m.index).split("\n").length;
            findings.push(issue(id, severity, relPath, `bank layout export ${m[1]} — move to ${MEMORY_FILE}`, line));
        }
    }
    return findings;
}
