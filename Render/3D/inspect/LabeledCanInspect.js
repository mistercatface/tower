import { renderInspectMesh } from "../MeshRenderer.js";
import { drawInspectCylindricalLabel } from "../CylinderInspectLabel.js";
import { getTexture, loadTexture, onTextureReady } from "../TextureCache.js";

/**
 * Factory for cylindrical labeled-can inspect views.
 * @param {import("../../../Config/props/JackoCan.js").JACKO_CAN} canConfig
 * @param {() => import("../CylinderMesh.js").buildSodaCanMesh} buildMesh
 */
export function createLabeledCanInspect(canConfig, buildMesh) {
    const { labelSrc, halfHeight, bodyRadius, label, colors } = canConfig;

    return {
        preload() {
            loadTexture(labelSrc);
        },
        onReady(fn) {
            loadTexture(labelSrc);
            onTextureReady(labelSrc, fn);
        },
        draw(ctx, cx, cy, scale, yaw, pitch) {
            const mesh = buildMesh();

            renderInspectMesh(ctx, mesh, cx, cy, scale, yaw, pitch, {
                imageSmoothing: false,
                flatShading: true,
            });

            drawInspectCylindricalLabel(ctx, cx, cy, scale, yaw, pitch, {
                img: getTexture(labelSrc),
                halfHeight,
                bodyRadius,
                y0: label.y0,
                y1: label.y1,
                angleCenter: label.angleCenter,
                angleSpan: label.angleSpan,
                radialSegments: label.radialSegments,
                verticalSegments: label.verticalSegments,
                underlay: colors.bodyInspect,
            });
        },
    };
}
