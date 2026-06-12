/**
 * Flat label overlay on box side faces for inspect view.
 * Corners per face are model-space BL, BR, TR, TL (viewed from outside).
 */
import { transformPoint, transformNormal, projectPoint, averageDepth } from "../camera/InspectCamera.js";
import { faceVisible } from "../geometry/MeshBuilder.js";
import { labelBandYRange } from "../../Math/Interpolate.js";
import { gatherTexturedQuadCells, drawTexturedQuadCells } from "../../Render/SurfaceTexturing/texturedCells.js";
/** @typedef {"+x" | "-x" | "+z" | "-z"} BoxSideFace */
/** Outward normals for vertical side faces. */
const FACE_NORMALS = { "+x": { x: 1, y: 0, z: 0 }, "-x": { x: -1, y: 0, z: 0 }, "+z": { x: 0, y: 0, z: 1 }, "-z": { x: 0, y: 0, z: -1 } };
const FACE_BUILDERS = {
    "+x": (hx, hy, hz, y0, y1) => {
        const { yBot, yTop } = labelBandYRange(hy, y0, y1);
        return [
            { x: hx, y: yBot, z: hz },
            { x: hx, y: yBot, z: -hz },
            { x: hx, y: yTop, z: -hz },
            { x: hx, y: yTop, z: hz },
        ];
    },
    "-x": (hx, hy, hz, y0, y1) => {
        const { yBot, yTop } = labelBandYRange(hy, y0, y1);
        return [
            { x: -hx, y: yBot, z: -hz },
            { x: -hx, y: yBot, z: hz },
            { x: -hx, y: yTop, z: hz },
            { x: -hx, y: yTop, z: -hz },
        ];
    },
    "+z": (hx, hy, hz, y0, y1) => {
        const { yBot, yTop } = labelBandYRange(hy, y0, y1);
        return [
            { x: -hx, y: yBot, z: hz },
            { x: hx, y: yBot, z: hz },
            { x: hx, y: yTop, z: hz },
            { x: -hx, y: yTop, z: hz },
        ];
    },
    "-z": (hx, hy, hz, y0, y1) => {
        const { yBot, yTop } = labelBandYRange(hy, y0, y1);
        return [
            { x: -hx, y: yBot, z: -hz },
            { x: hx, y: yBot, z: -hz },
            { x: hx, y: yTop, z: -hz },
            { x: -hx, y: yTop, z: -hz },
        ];
    },
};
const sBoxLabelFaces = [];
const sBoxLabelRaw = [{ u0: 0, u1: 1, v0: 0, v1: 1, depth: 0, d0: { x: 0, y: 0 }, d1: { x: 0, y: 0 }, d2: { x: 0, y: 0 }, d3: { x: 0, y: 0 } }];
/** Flip U when the projected bottom edge runs right-to-left on screen. */
function alignHorizontalUV(d0, d1, d2, d3) {
    if (d0.x > d1.x) return [d1, d0, d3, d2];
    return [d0, d1, d2, d3];
}
/** Narrow the face width so band height × texture aspect fits without vertical stretch. */
function clampFaceWidthToTextureAspect(model, face, targetHalfWidth) {
    const axis = face === "+x" || face === "-x" ? "z" : "x";
    for (let i = 0; i < model.length; i++) {
        const p = model[i];
        const w = p[axis];
        if (Math.abs(w) > targetHalfWidth) p[axis] = Math.sign(w || 1) * targetHalfWidth;
    }
}
/** Draw label texture on configured vertical box faces. */
export function drawInspectBoxLabels(
    ctx,
    cx,
    cy,
    scale,
    yaw,
    pitch,
    {
        img = null,
        resolveImg = null,
        halfExtents = { x: 0.55, y: 0.5, z: 0.55 },
        faces = ["+x", "-x", "+z", "-z"],
        y0 = 0.18,
        y1 = 0.82,
        u0 = 0,
        v0 = 0,
        u1 = 1,
        v1 = 1,
        underlay = "#8D6E63",
        referenceDepth = 420,
        screenScale = scale * 88,
        screenBleed = 1.25,
    } = {},
) {
    if (!img && !resolveImg) return;
    const camera = { cx, cy, referenceDepth, screenScale };
    const hx = halfExtents.x;
    const hy = halfExtents.y;
    const hz = halfExtents.z;
    sBoxLabelFaces.length = 0;
    for (const face of faces) {
        const faceImg = resolveImg?.(face) ?? img;
        if (!faceImg) continue;
        const iw = faceImg.width;
        const ih = faceImg.height;
        const sx0 = u0 * iw;
        const sx1 = u1 * iw;
        const syTop = v0 * ih;
        const syBot = v1 * ih;
        const build = FACE_BUILDERS[face];
        if (!build) continue;
        const { yBot, yTop } = labelBandYRange(hy, y0, y1);
        const bandHeight = yTop - yBot;
        const texAspect = (sx1 - sx0) / Math.max(syBot - syTop, 1e-6);
        const targetHalfWidth = (bandHeight * texAspect) / 2;
        const model = build(hx, hy, hz, y0, y1);
        clampFaceWidthToTextureAspect(model, face, targetHalfWidth);
        const viewNormal = transformNormal(FACE_NORMALS[face], yaw, pitch);
        if (!faceVisible(viewNormal)) continue;
        const view = model.map((p) => transformPoint(p, yaw, pitch));
        const screen = view.map((p) => projectPoint(p, camera));
        if (screen.some((p) => !p)) continue;
        const [d0, d1, d2, d3] = alignHorizontalUV(screen[0], screen[1], screen[2], screen[3]);
        sBoxLabelFaces.push({ depth: averageDepth(view[0], view[1], view[2]), faceImg, u0, u1, v0, v1, d0, d1, d2, d3 });
    }
    if (sBoxLabelFaces.length === 0) return;
    sBoxLabelFaces.sort((a, b) => b.depth - a.depth);
    const raw = sBoxLabelRaw[0];
    for (let i = 0; i < sBoxLabelFaces.length; i++) {
        const face = sBoxLabelFaces[i];
        raw.u0 = face.u0;
        raw.u1 = face.u1;
        raw.v0 = face.v1;
        raw.v1 = face.v0;
        raw.depth = face.depth;
        raw.d0 = face.d0;
        raw.d1 = face.d1;
        raw.d2 = face.d2;
        raw.d3 = face.d3;
        const cells = gatherTexturedQuadCells(sBoxLabelRaw, face.faceImg, 0);
        drawTexturedQuadCells(ctx, cells, face.faceImg, { bleedPx: screenBleed, underlay });
    }
}
