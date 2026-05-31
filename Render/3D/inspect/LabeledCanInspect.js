import { renderInspectMesh } from "../MeshRenderer.js";
import { drawInspectCylindricalBody, drawInspectCylindricalLabel } from "../CylinderInspect.js";
import { getSodaCanRings } from "../geometry/CylinderMesh.js";
import { getTexture, loadTexture, onTextureReady } from "../core/TextureCache.js";

/**
 * Factory for cylindrical labeled-can inspect views.
 * @param {import("../../../Config/props/JackoCan.js").JACKO_CAN} canConfig — optional `inspect.initialPitch`
 * @param {() => import("../geometry/CylinderMesh.js").buildSodaCanMesh} buildMesh
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
            const surface = { halfHeight, bodyRadius, rings: getSodaCanRings(halfHeight, bodyRadius) };
            const { radialSegments, verticalSegments, y0, y1, angleCenter, angleSpan } = label;

            drawInspectCylindricalBody(ctx, cx, cy, scale, yaw, pitch, {
                ...surface,
                color: colors.bodyInspect,
                radialSegments: radialSegments * 2,
                verticalSegments: verticalSegments * 2,
            });

            renderInspectMesh(ctx, buildMesh(), cx, cy, scale, yaw, pitch, {
                imageSmoothing: false,
                flatShading: true,
            });

            drawInspectCylindricalLabel(ctx, cx, cy, scale, yaw, pitch, {
                ...surface,
                img: getTexture(labelSrc),
                y0,
                y1,
                angleCenter,
                angleSpan,
                radialSegments,
                verticalSegments,
                underlay: colors.bodyInspect,
            });
        },
    };
}
