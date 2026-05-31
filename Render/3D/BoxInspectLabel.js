/**
 * Flat label overlay on box side faces for inspect view.
 */
import {
    transformPoint,
    projectPoint,
    faceVisible,
    triangleNormal,
    averageDepth,
} from "./core/Mesh3D.js";
import { drawImageQuad } from "./core/AffineTexture.js";

/** @typedef {"+x" | "-x" | "+z" | "-z"} BoxSideFace */

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
            { x: hx, y: yBot, z: -hz },
            { x: -hx, y: yBot, z: -hz },
            { x: -hx, y: yTop, z: -hz },
            { x: hx, y: yTop, z: -hz },
        ];
    },
};

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
    // Screen Y grows downward; model +Y projects upward — flip V so image top meets face top.
    const syTop = v0 * ih;
    const syBot = v1 * ih;

    const quads = [];

    for (const face of faces) {
        const build = FACE_BUILDERS[face];
        if (!build) continue;

        const model = build(hx, hy, hz, y0, y1);
        const view = model.map((p) => transformPoint(p, yaw, pitch));
        const normal = triangleNormal(view[0], view[1], view[2]);
        if (!faceVisible(normal)) continue;

        const screen = view.map((p) => projectPoint(p, camera));
        if (screen.some((p) => !p)) continue;

        quads.push({
            depth: averageDepth(view[0], view[1], view[2]),
            d0: screen[0],
            d1: screen[1],
            d2: screen[2],
            d3: screen[3],
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
