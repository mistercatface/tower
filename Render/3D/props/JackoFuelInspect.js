import { renderInspectMesh } from "../MeshRenderer.js";
import { drawInspectCylindricalLabel } from "../CylinderInspectLabel.js";
import { getTexture, loadTexture, onTextureReady } from "../TextureCache.js";
import { JACKO_CAN, JACKO_LABEL_SRC, buildJackoInspectMesh } from "./JackoFuelCan.js";

export function preloadJackoFuelLabel() {
    return loadTexture(JACKO_LABEL_SRC);
}

export function onJackoFuelLabelReady(fn) {
    loadTexture(JACKO_LABEL_SRC);
    onTextureReady(JACKO_LABEL_SRC, fn);
}

export function drawJackoFuelBarrelInspect(ctx, cx, cy, scale, yaw, pitch) {
    const { halfHeight, bodyRadius, label, colors } = JACKO_CAN;
    const mesh = buildJackoInspectMesh();

    renderInspectMesh(ctx, mesh, cx, cy, scale, yaw, pitch, { imageSmoothing: false, flatShading: true });

    drawInspectCylindricalLabel(ctx, cx, cy, scale, yaw, pitch, {
        img: getTexture(JACKO_LABEL_SRC),
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
}
