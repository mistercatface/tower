/**
 * Mass helpers for collision response (top-down bodies).
 */
/** @param {{ mass?: number, radius?: number }} body */
export function massFromBody(body, defaultMass = 15) {
    if (body.mass !== undefined) return body.mass;
    if (body.radius !== undefined) return body.radius;
    return defaultMass;
}
/** @param {{ mass?: number, radius?: number }} body */
export function inverseMassFromBody(body, defaultMass = 15) {
    const m = massFromBody(body, defaultMass);
    return 1 / m;
}
