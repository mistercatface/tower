/**
 * Public API for cylindrical inspect views.
 * Mesh body via MeshRenderer; label via drawInspectCylindricalLabel overlay.
 */
export { drawInspectCylindricalLabel } from "./CylinderInspectLabel.js";
export { buildCylinderMesh, buildSodaCanMesh } from "./CylinderMesh.js";
export { renderInspectMesh, renderMesh } from "./MeshRenderer.js";
export { loadTexture, getTexture, onTextureReady } from "./TextureCache.js";
export { createInspectCamera, vec3 } from "./Mesh3D.js";
export { drawImageTriangle, drawImageQuad } from "./AffineTexture.js";

import { loadTexture, onTextureReady } from "./TextureCache.js";

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
