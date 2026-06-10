import { Pickup } from "../../Entities/Pickup.js";
/**
 * @typedef {object} StartPropSpec
 * @property {string} type — worldPropDefinitions key
 * @property {number} x
 * @property {number} y
 * @property {number} [facing]
 */
/**
 * @param {object} state
 * @param {StartPropSpec[]} specs
 */
export function spawnStartProps(state, specs) {
    if (!specs.length) return;
    for (const spec of specs) state.pickups.push(new Pickup(spec.x, spec.y, spec.type, spec.facing ?? null));
}
