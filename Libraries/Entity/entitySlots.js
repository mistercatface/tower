import { MAX_ENTITIES } from "../../Core/engineLimits.js";
export const ENTITY_KIND_NONE = 0;
export const ENTITY_KIND_WORLD_PROP = 1;
export const ENTITY_KIND_DEBRIS = 2;
export const ENTITY_FLAG_DEAD = 1 << 0;
export const ENTITY_FLAG_KINETIC = 1 << 1;
export const entityX = new Float32Array(MAX_ENTITIES);
export const entityY = new Float32Array(MAX_ENTITIES);
export const entityVx = new Float32Array(MAX_ENTITIES);
export const entityVy = new Float32Array(MAX_ENTITIES);
export const entityW = new Float32Array(MAX_ENTITIES);
export const entityR = new Float32Array(MAX_ENTITIES);
export const entityKind = new Uint8Array(MAX_ENTITIES);
export const entityFlags = new Uint32Array(MAX_ENTITIES);
export const entityAlive = new Uint8Array(MAX_ENTITIES);
export const entityGen = new Uint32Array(MAX_ENTITIES);
export const entityGameId = new Int32Array(MAX_ENTITIES).fill(-1);
export const entityTypeId = new Int32Array(MAX_ENTITIES).fill(-1);
export const entityRefs = new Array(MAX_ENTITIES);
export const entitySpatialGen = new Uint32Array(MAX_ENTITIES);
export const entityGridTileIdx = new Int32Array(MAX_ENTITIES).fill(-1);
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
    entityTypeId[eid] = -1;
    entityR[eid] = 0;
    entityRefs[eid] = null;
    entityGridTileIdx[eid] = -1;
    entityGen[eid] = (entityGen[eid] + 1) | 0;
    eidFreeList.push(eid);
}
export function bindEntitySlot(eid, kind, ref, gameId, x, y, r, flags) {
    entityAlive[eid] = 1;
    entityKind[eid] = kind;
    entityFlags[eid] = flags;
    entityGameId[eid] = gameId;
    entityX[eid] = x;
    entityY[eid] = y;
    entityVx[eid] = ref.vx ?? 0;
    entityVy[eid] = ref.vy ?? 0;
    entityW[eid] = ref.angularVelocity ?? 0;
    entityR[eid] = r;
    entityRefs[eid] = ref;
}
export function syncEntitySlotPoseFromRef(eid, ref) {
    entityX[eid] = ref._poseX !== undefined ? ref._poseX : ref.x;
    entityY[eid] = ref._poseY !== undefined ? ref._poseY : ref.y;
    entityVx[eid] = ref._poseVx !== undefined ? ref._poseVx : (ref.vx ?? 0);
    entityVy[eid] = ref._poseVy !== undefined ? ref._poseVy : (ref.vy ?? 0);
    entityW[eid] = ref._poseW !== undefined ? ref._poseW : (ref.angularVelocity ?? 0);
}
export function writebackEntitySlotPoseToRef(eid, ref) {
    const x = entityX[eid];
    const y = entityY[eid];
    const vx = entityVx[eid];
    const vy = entityVy[eid];
    const w = entityW[eid];
    if (ref._poseX !== undefined) {
        ref._poseX = x;
        ref._poseY = y;
        ref._poseVx = vx;
        ref._poseVy = vy;
        ref._poseW = w;
        return;
    }
    ref.x = x;
    ref.y = y;
    ref.vx = vx;
    ref.vy = vy;
    ref.angularVelocity = w;
}
export function entitySlotRef(eid) {
    return entityAlive[eid] ? entityRefs[eid] : null;
}
