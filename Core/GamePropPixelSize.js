export const propPixelSize = 32;
export function quantizePropBakeZoom(zoom) {
    if (!Number.isFinite(zoom) || zoom <= 0) return 1;
    return Math.max(0.25, Math.round(zoom * 8) / 8);
}
export function resolvePropBakeScale(worldDiameter, zoom = 1) {
    if (worldDiameter <= 0) return 1;
    const viewZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const screenDiameter = worldDiameter * viewZoom;
    const bakeDiameter = Math.max(propPixelSize, screenDiameter, worldDiameter);
    return bakeDiameter / worldDiameter;
}
