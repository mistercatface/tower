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
/** @param {object[]} pickups @param {number} id @returns {object | null} */
export function findPickupById(pickups, id) {
    for (const pickup of pickups) if (pickup.id === id) return pickup;
    return null;
}
/** @param {object[]} pickups @param {number} id @returns {object | null} */
export function findLivePickup(pickups, id) {
    const pickup = findPickupById(pickups, id);
    return pickup && !pickup.isDead ? pickup : null;
}
