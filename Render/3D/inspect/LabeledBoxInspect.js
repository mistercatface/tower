import { renderInspectMesh } from "../MeshRenderer.js";
import { drawInspectBoxLabels } from "../BoxInspectLabel.js";
import { getTexture, loadTexture, onTextureReady } from "../core/TextureCache.js";

/**
 * Factory for labeled box inspect views.
 * @param {import("../../../Config/props/Crate.js").WOOD_CRATE} boxConfig
 * @param {() => import("../BoxMesh.js").buildBoxMesh} buildMesh
 * @param {(pickup: import("../../../Entities/Pickup.js").Pickup | null | undefined) => string} resolveLabelSrc
 */
export function createLabeledBoxInspect(boxConfig, buildMesh, resolveLabelSrc) {
    const { labelVariants, labelSrc, halfExtents, label, colors, keyWhite = true } = boxConfig;
    const sources = labelVariants ?? (labelSrc ? [labelSrc] : []);
    const textureOpts = { keyWhite };
    const pickSrc = resolveLabelSrc ?? (() => sources[0]);

    return {
        preload() {
            for (const src of sources) {
                loadTexture(src, textureOpts);
            }
        },
        onReady(fn) {
            for (const src of sources) {
                loadTexture(src, textureOpts);
                onTextureReady(src, fn);
            }
        },
        draw(ctx, cx, cy, scale, yaw, pitch, pickup) {
            const mesh = buildMesh();
            const activeSrc = pickSrc(pickup);

            renderInspectMesh(ctx, mesh, cx, cy, scale, yaw, pitch, {
                imageSmoothing: false,
                flatShading: true,
            });

            drawInspectBoxLabels(ctx, cx, cy, scale, yaw, pitch, {
                img: getTexture(activeSrc),
                halfExtents,
                faces: label.faces,
                y0: label.y0,
                y1: label.y1,
                u0: label.u0,
                v0: label.v0,
                u1: label.u1,
                v1: label.v1,
                underlay: colors.bodyInspect,
            });
        },
    };
}
