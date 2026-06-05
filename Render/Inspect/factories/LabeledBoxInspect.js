import { renderInspectMesh } from "../draw/MeshRenderer.js";
import { drawInspectBoxLabels } from "../draw/BoxInspectLabel.js";
import { getTexture, loadTexture, onTextureReady } from "../../3D/core/TextureCache.js";

/**
 * Factory for labeled box inspect views.
 * @param {import("../../../Config/props/Crate.js").WOOD_CRATE} boxConfig
 * @param {() => import("../../3D/geometry/BoxMesh.js").buildBoxMesh} buildMesh
 * @param {(pickup: import("../../../Entities/Pickup.js").Pickup | null | undefined, face: string) => string} resolveFaceLabelSrc
 */
export function createLabeledBoxInspect(boxConfig, buildMesh, resolveFaceLabelSrc) {
    const { labelVariants, labelSrc, halfExtents, label, colors, keyWhite = true } = boxConfig;
    const sources = labelVariants ?? (labelSrc ? [labelSrc] : []);
    const textureOpts = { keyWhite };

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

            renderInspectMesh(ctx, mesh, cx, cy, scale, yaw, pitch, {
                imageSmoothing: false,
                flatShading: true,
            });

            drawInspectBoxLabels(ctx, cx, cy, scale, yaw, pitch, {
                resolveImg: (face) => {
                    const src = resolveFaceLabelSrc?.(pickup, face);
                    return src ? getTexture(src) : null;
                },
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
