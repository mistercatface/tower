export const KINETIC_PAIR_TIER = { CIRCLE_CIRCLE: 0, CIRCLE_POLY: 1, POLY_POLY: 2, COMPOUND: 3 };
export function classifyKineticPairTier(bodyA, bodyB) {
    if (bodyA.collisionParts?.length > 1 || bodyB.collisionParts?.length > 1) return KINETIC_PAIR_TIER.COMPOUND;
    const shapeA = bodyA.collisionParts?.[0] ?? bodyA.shape;
    const shapeB = bodyB.collisionParts?.[0] ?? bodyB.shape;
    if (shapeA?.type === "Circle" && shapeB?.type === "Circle") return KINETIC_PAIR_TIER.CIRCLE_CIRCLE;
    if (shapeA?.type === "Circle" || shapeB?.type === "Circle") return KINETIC_PAIR_TIER.CIRCLE_POLY;
    return KINETIC_PAIR_TIER.POLY_POLY;
}
export function circleCirclePairShapes(bodyA, bodyB) {
    const shapeA = bodyA.collisionParts?.[0] ?? bodyA.shape;
    const shapeB = bodyB.collisionParts?.[0] ?? bodyB.shape;
    return { shapeA, shapeB };
}
