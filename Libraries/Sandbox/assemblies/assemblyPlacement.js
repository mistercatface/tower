/** @typedef {import("../../Math/Aabb2D.js").Aabb2D & { centerX?: number, centerY?: number }} AssemblyPlacementBounds */
/**
 * @param {AssemblyPlacementBounds} bounds
 * @param {{ anchor: string, offset?: { x?: number, y?: number } }} placement
 * @param {number} [offsetScale]
 */
export function resolveAnchoredPlacement(bounds, placement, offsetScale = 1) {
    const centerX = bounds.centerX ?? (bounds.minX + bounds.maxX) * 0.5;
    const centerY = bounds.centerY ?? (bounds.minY + bounds.maxY) * 0.5;
    /** @type {{ x: number, y: number }} */
    let point;
    switch (placement.anchor) {
        case "playfield.topLeft":
            point = { x: bounds.minX, y: bounds.minY };
            break;
        case "playfield.topRight":
            point = { x: bounds.maxX, y: bounds.minY };
            break;
        case "playfield.bottomLeft":
            point = { x: bounds.minX, y: bounds.maxY };
            break;
        case "playfield.bottomRight":
            point = { x: bounds.maxX, y: bounds.maxY };
            break;
        case "playfield.left":
            point = { x: bounds.minX, y: centerY };
            break;
        case "playfield.right":
            point = { x: bounds.maxX, y: centerY };
            break;
        case "playfield.center":
            point = { x: centerX, y: centerY };
            break;
        default:
            throw new Error(`Unsupported placement anchor "${placement.anchor}"`);
    }
    const ox = (placement.offset?.x ?? 0) * offsetScale;
    const oy = (placement.offset?.y ?? 0) * offsetScale;
    return { x: point.x + ox, y: point.y + oy };
}
/**
 * @param {AssemblyPlacementBounds} bounds
 * @param {{ space?: string, u: number, v: number }} placement
 */
export function resolvePlayfieldPlacement(bounds, placement) {
    if (placement.space != null && placement.space !== "playfield") throw new Error(`Unsupported placement space "${placement.space}"`);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    return { x: bounds.minX + placement.u * width, y: bounds.minY + placement.v * height };
}
/**
 * @param {AssemblyPlacementBounds} bounds
 * @param {{ anchor?: string, offset?: { x?: number, y?: number }, space?: string, u?: number, v?: number }} placement
 * @param {number} [offsetScale]
 */
export function resolvePlacement(bounds, placement, offsetScale = 1) {
    if (placement.anchor) return resolveAnchoredPlacement(bounds, placement, offsetScale);
    if (typeof placement.u === "number" && typeof placement.v === "number") return resolvePlayfieldPlacement(bounds, placement);
    throw new Error("Placement requires anchor or playfield u/v");
}
