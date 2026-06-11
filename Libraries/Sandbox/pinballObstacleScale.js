/**
 * @param {object} pickup
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {object} asset
 */
export function applyPinballObstacleScale(pickup, layout, asset) {
    const radiusU = asset?.physics?.radiusU;
    if (radiusU == null) return;
    const playW = layout.play.maxX - layout.play.minX;
    const radius = playW * radiusU;
    pickup.radius = radius;
    pickup.strategy.propPixelSize = radius * 2;
    if (pickup.shape?.type === "Circle") pickup.shape.radius = radius;
}
