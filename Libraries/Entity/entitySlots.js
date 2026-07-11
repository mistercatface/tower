import { MAX_ENTITIES } from "../../Core/engineLimits.js";
import { entityX, entityY, entityVx, entityVy, entityW, entityFacing, entityR, entityKind, entityFlags, entityAlive, entityGameId, entityRefs, entityGridTileIdx, entityRollQw, entityRollQx, entityRollQy, entityRollQz } from "../../Core/engineMemory.js";
export const ENTITY_KIND_NONE = 0;
export const ENTITY_KIND_WORLD_PROP = 1;
export const ENTITY_KIND_DEBRIS = 2;
export const ENTITY_FLAG_DEAD = 1 << 0;
export const ENTITY_FLAG_KINETIC = 1 << 1;
let nextEid = 0;
const eidFreeList = [];
export function allocateEntityEid() {
    if (eidFreeList.length) return eidFreeList.pop();
    const eid = nextEid++;
    if (eid >= MAX_ENTITIES) throw new Error(`Entity eid limit exceeded: ${eid} >= ${MAX_ENTITIES}`);
    return eid;
}
export function noteEntityEidHighWater(eid) {
    if (eid >= nextEid) nextEid = eid + 1;
}
export function entityEidHighWater() {
    return nextEid;
}
export function entityEidFreeCount() {
    return eidFreeList.length;
}
export function releaseEntityEid(eid) {
    entityAlive[eid] = 0;
    entityKind[eid] = ENTITY_KIND_NONE;
    entityFlags[eid] = 0;
    entityGameId[eid] = -1;
    entityR[eid] = 0;
    entityRefs[eid] = null;
    entityGridTileIdx[eid] = -1;
    eidFreeList.push(eid);
}
export function bindEntitySlot(eid, kind, ref, gameId, x, y, r, flags) {
    entityAlive[eid] = 1;
    entityKind[eid] = kind;
    entityFlags[eid] = flags;
    entityGameId[eid] = gameId;
    entityX[eid] = x;
    entityY[eid] = y;
    entityVx[eid] = ref._spawnVx ?? ref.vx ?? 0;
    entityVy[eid] = ref._spawnVy ?? ref.vy ?? 0;
    entityW[eid] = ref._spawnW ?? ref.angularVelocity ?? 0;
    entityFacing[eid] = ref._spawnFacing ?? ref.facing ?? 0;
    entityRollQw[eid] = ref._spawnRollQw ?? 1;
    entityRollQx[eid] = ref._spawnRollQx ?? 0;
    entityRollQy[eid] = ref._spawnRollQy ?? 0;
    entityRollQz[eid] = ref._spawnRollQz ?? 0;
    entityR[eid] = r;
    entityRefs[eid] = ref;
}
export function clearWorldPropSpawnPose(ref) {
    delete ref._spawnX;
    delete ref._spawnY;
    delete ref._spawnVx;
    delete ref._spawnVy;
    delete ref._spawnW;
    delete ref._spawnFacing;
    delete ref._spawnRollQw;
    delete ref._spawnRollQx;
    delete ref._spawnRollQy;
    delete ref._spawnRollQz;
}
export function entitySlotRef(eid) {
    return entityAlive[eid] ? entityRefs[eid] : null;
}
