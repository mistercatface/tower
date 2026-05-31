/**
 * High-level API for textured cylinder inspect views.
 * Use this when adding new barrel / can props with label images.
 */
import { buildCylinderMesh, buildSodaCanMesh } from "./CylinderMesh.js";
import { renderInspectMesh } from "./MeshRenderer.js";
import { loadTexture, getTexture, onTextureReady } from "./TextureCache.js";

export { drawInspectCylindricalLabel } from "./CylinderInspectLabel.js";
export { buildCylinderMesh, buildSodaCanMesh } from "./CylinderMesh.js";
export { renderInspectMesh, renderMesh } from "./MeshRenderer.js";
export { loadTexture, getTexture, onTextureReady } from "./TextureCache.js";
export { createInspectCamera, vec3 } from "./Mesh3D.js";

/**
 * @typedef {Object} TexturedCylinderInspectOptions
 * @property {import("./CylinderMesh.js").buildCylinderMesh} mesh - prebuilt mesh
 * @property {Record<string, string>} textureSources - materialId -> image path
 * @property {boolean} [onFire]
 * @property {number} [focalLength]
 * @property {number} [distance]
 */

/**
 * Draw a textured cylinder mesh in the inspect viewer.
 *
 * Example for a future barrel:
 * ```
 * const mesh = buildCylinderMesh({
 *   halfHeight: 1.2,
 *   bodyRadius: 0.55,
 *   labels: [{ materialId: "brand", y0: 0.2, y1: 0.8, angleCenter: -Math.PI/2, angleSpan: Math.PI }],
 *   materials: { brand: { type: "texture", source: "brand" }, body: { type: "solid", color: "#888" } },
 * });
 * drawTexturedCylinderInspect(ctx, cx, cy, scale, yaw, pitch, {
 *   mesh,
 *   textureSources: { brand: "Images/my_barrel.png" },
 * });
 * ```
 */
export function drawTexturedCylinderInspect(ctx, cx, cy, scale, yaw, pitch, {
    mesh,
    textureSources = {},
    referenceDepth = 420,
    screenScale = scale * 88,
    imageSmoothing = false,
}) {
    const textureMap = {};
    for (const [materialId, src] of Object.entries(textureSources)) {
        loadTexture(src);
        const img = getTexture(src);
        if (img) textureMap[materialId] = img;
    }

    renderInspectMesh(ctx, mesh, cx, cy, scale, yaw, pitch, {
        textureMap,
        referenceDepth,
        screenScale,
        imageSmoothing,
    });
}

export function preloadCylinderTextures(textureSources) {
    for (const src of Object.values(textureSources)) {
        loadTexture(src);
    }
}

export function onCylinderTexturesReady(textureSources, fn) {
    const srcs = Object.values(textureSources);
    let pending = srcs.length;
    if (pending === 0) {
        fn();
        return;
    }
    for (const src of srcs) {
        onTextureReady(src, () => {
            pending -= 1;
            if (pending === 0) fn();
        });
    }
}
