/**
 * Flat label overlay on box side faces for inspect view.
 * Corners per face are model-space BL, BR, TR, TL (viewed from outside).
 */
import {
    transformPoint,
    transformNormal,
    projectPoint,
    faceVisible,
    averageDepth,
} from "./core/Mesh3D.js";
import { drawImageQuad } from "./core/AffineTexture.js";

/** @typedef {"+x" | "-x" | "+z" | "-z"} BoxSideFace */

/** Outward normals for vertical side faces. */
const FACE_NORMALS = {
    "+x": { x: 1, y: 0, z: 0 },
    "-x": { x: -1, y: 0, z: 0 },
    "+z": { x: 0, y: 0, z: 1 },
    "-z": { x: 0, y: 0, z: -1 },
};

const FACE_BUILDERS = {
    "+x": (hx, hy, hz, y0, y1) => {
        const yBot = -hy + hy * 2 * y0;
        const yTop = -hy + hy * 2 * y1;
        return [
            { x: hx, y: yBot, z: hz },
            { x: hx, y: yBot, z: -hz },
            { x: hx, y: yTop, z: -hz },
            { x: hx, y: yTop, z: hz },
        ];
    },
    "-x": (hx, hy, hz, y0, y1) => {
        const yBot = -hy + hy * 2 * y0;
        const yTop = -hy + hy * 2 * y1;
        return [
            { x: -hx, y: yBot, z: -hz },
            { x: -hx, y: yBot, z: hz },
            { x: -hx, y: yTop, z: hz },
            { x: -hx, y: yTop, z: -hz },
        ];
    },
    "+z": (hx, hy, hz, y0, y1) => {
        const yBot = -hy + hy * 2 * y0;
        const yTop = -hy + hy * 2 * y1;
        return [
            { x: -hx, y: yBot, z: hz },
            { x: hx, y: yBot, z: hz },
            { x: hx, y: yTop, z: hz },
            { x: -hx, y: yTop, z: hz },
        ];
    },
    "-z": (hx, hy, hz, y0, y1) => {
        const yBot = -hy + hy * 2 * y0;
        const yTop = -hy + hy * 2 * y1;
        return [
            { x: -hx, y: yBot, z: -hz },
            { x: hx, y: yBot, z: -hz },
            { x: hx, y: yTop, z: -hz },
            { x: -hx, y: yTop, z: -hz },
        ];
    },
};

/** Flip U when the projected bottom edge runs right-to-left on screen. */
function alignHorizontalUV(d0, d1, d2, d3) {
    if (d0.x > d1.x) {
        return [d1, d0, d3, d2];
    }
    return [d0, d1, d2, d3];
}

/** Draw label texture on configured vertical box faces. */
export function drawInspectBoxLabels(ctx, cx, cy, scale, yaw, pitch, {
    img,
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
} = {}) {
    if (!img) return;

    const camera = { cx, cy, referenceDepth, screenScale };
    const hx = halfExtents.x;
    const hy = halfExtents.y;
    const hz = halfExtents.z;
    const iw = img.width;
    const ih = img.height;
    const sx0 = u0 * iw;
    const sx1 = u1 * iw;
    const syTop = v0 * ih;
    const syBot = v1 * ih;

    const quads = [];

    for (const face of faces) {
        const build = FACE_BUILDERS[face];
        if (!build) continue;

        const model = build(hx, hy, hz, y0, y1);
        const viewNormal = transformNormal(FACE_NORMALS[face], yaw, pitch);
        if (!faceVisible(viewNormal)) continue;

        const view = model.map((p) => transformPoint(p, yaw, pitch));
        const screen = view.map((p) => projectPoint(p, camera));
        if (screen.some((p) => !p)) continue;

        const [d0, d1, d2, d3] = alignHorizontalUV(screen[0], screen[1], screen[2], screen[3]);

        quads.push({
            depth: averageDepth(view[0], view[1], view[2]),
            d0, d1, d2, d3,
        });
    }

    if (quads.length === 0) return;

    quads.sort((a, b) => b.depth - a.depth);

    const textureOpts = { underlay, bleedPx: screenBleed };
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    for (const quad of quads) {
        drawImageQuad(
            ctx, img,
            sx0, syBot, sx1, syTop,
            quad.d0, quad.d1, quad.d2, quad.d3,
            textureOpts,
        );
    }
    ctx.imageSmoothingEnabled = prevSmooth;
}
