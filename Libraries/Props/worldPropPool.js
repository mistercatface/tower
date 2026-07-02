import { WorldProp } from "../../Entities/WorldProp.js";
import { IDENTITY_ROLL_QUAT } from "./rollingMotion.js";
import { quantizeCardinalAngle } from "../Math/Angle.js";
import { initWorldPropShape } from "./propStrategy.js";
const pools = new Map();
/**
 * Acquire a pooled WorldProp instance or create a new one.
 * Resets critical physical and state properties.
 *
 * @param {number} x
 * @param {number} y
 * @param {string} type
 * @param {number|null} [facing]
 * @returns {WorldProp}
 */
export function acquireWorldProp(x, y, type, facing = null) {
    let list = pools.get(type);
    if (!list) {
        list = [];
        pools.set(type, list);
    }
    if (list.length > 0) {
        const prop = list.pop();
        // Reset spatial properties
        prop.x = x;
        prop.y = y;
        prop.z = 0;
        prop.isDead = false;
        // Reset motion state
        prop.vx = 0;
        prop.vy = 0;
        prop.angularVelocity = 0;
        prop.ageMs = 0;
        prop._sleepFrames = 0;
        prop.isSleeping = false;
        prop.stateTimer = 0;
        prop.stateData = {};
        // Reset facing / roll quaternions
        if (prop.strategy?.cardinalFacing) prop.facing = quantizeCardinalAngle(facing ?? 0);
        else prop.facing = facing ?? Math.random() * Math.PI * 2;
        if (prop.strategy?.rolls) prop.rollQuat = { ...IDENTITY_ROLL_QUAT };
        // Clear refs and debris-specific properties
        prop.chunks = undefined;
        prop.collisionParts = undefined;
        prop.snakeFoodValue = undefined;
        prop._glassFractureCooldown = 0;
        prop.faction = undefined;
        prop.shape = undefined;
        prop.footprintVertices = undefined;
        initWorldPropShape(prop);
        // Reset physics / broadphase / neighbor state
        if (prop._kineticLinkNeighbors) prop._kineticLinkNeighbors.length = 0;
        prop._kineticIslandPeers = null;
        if (prop._neighbors) prop._neighbors.length = 0;
        prop._neighborsFrameId = -1;
        delete prop._physId;
        delete prop._activeSlot;
        // Re-run FSM state to reset to normal
        prop.changeState("normal");
        return prop;
    }
    return new WorldProp(x, y, type, facing);
}
/**
 * Release a WorldProp instance to the pool if it is a debris type.
 *
 * @param {WorldProp} prop
 */
export function releaseWorldProp(prop) {
    if (!prop) return;
    const type = prop.type;
    const isDebris = prop.strategy?.fractureMode === "glass" || prop.strategy?.fractureMode === "chunk";
    if (!isDebris) return;
    // Clear shapes/geometries to release heavy arrays
    prop.shape = undefined;
    prop.collisionParts = undefined;
    prop.footprintVertices = undefined;
    let list = pools.get(type);
    if (!list) {
        list = [];
        pools.set(type, list);
    }
    if (list.indexOf(prop) === -1) list.push(prop);
}
/**
 * Clear the pool contents (useful for tests or level transition).
 */
export function clearWorldPropPools() {
    pools.clear();
}
/**
 * Get pool size for a given prop type (useful for tests).
 *
 * @param {string} type
 * @returns {number}
 */
export function getWorldPropPoolSize(type) {
    return pools.get(type)?.length ?? 0;
}
