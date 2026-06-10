/**
 * @param {object[]} pickups
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [padding]
 * @returns {object | null}
 */
export function findPickupAt(pickups, worldX, worldY, padding = 8) {
    let best = null;
    let bestDistSq = Infinity;
    for (const pickup of pickups) {
        if (pickup.isDead) continue;
        const tapRadius = pickup.radius + padding;
        const distSq = (pickup.x - worldX) ** 2 + (pickup.y - worldY) ** 2;
        if (distSq <= tapRadius * tapRadius && distSq < bestDistSq) {
            best = pickup;
            bestDistSq = distSq;
        }
    }
    return best;
}
