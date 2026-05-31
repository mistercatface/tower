import { renderInspectMesh } from "../MeshRenderer.js";
import { drawInspectCylindricalBody } from "../CylinderInspectBody.js";
import { drawInspectCylindricalLabel } from "../CylinderInspectLabel.js";
import { getSodaCanRings } from "../CylinderMesh.js";
import { getTexture, loadTexture, onTextureReady } from "../core/TextureCache.js";

/**
 * Factory for cylindrical labeled-can inspect views.
 * @param {import("../../../Config/props/JackoCan.js").JACKO_CAN} canConfig — optional `inspect.initialPitch`
 * @param {() => import("../CylinderMesh.js").buildSodaCanMesh} buildMesh
 */
export function createLabeledCanInspect(canConfig, buildMesh) {
    const { labelSrc, halfHeight, bodyRadius, label, colors } = canConfig;
    const angleCenter = label.angleCenter ?? -Math.PI / 2;
    /** Face the label toward the inspect camera (-Z); ignore pickup spawn facing. */
    const initialYaw = -Math.PI / 2 - angleCenter;
    const initialPitch = canConfig.inspect?.initialPitch ?? 0.2;

    return {
        getInitialYaw: () => initialYaw,
        getInitialPitch: () => initialPitch,
        preload() {
            loadTexture(labelSrc);
        },
        onReady(fn) {
            loadTexture(labelSrc);
            onTextureReady(labelSrc, fn);
        },
        draw(ctx, cx, cy, scale, yaw, pitch) {
            const mesh = buildMesh();
            const rings = getSodaCanRings(halfHeight, bodyRadius);

            drawInspectCylindricalBody(ctx, cx, cy, scale, yaw, pitch, {
                halfHeight,
                bodyRadius,
                rings,
                color: colors.bodyInspect,
                radialSegments: label.radialSegments * 2,
                verticalSegments: label.verticalSegments * 2,
                subRadial: 2,
                subVertical: 2,
            });

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
