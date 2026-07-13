import { MAX_ENTITIES } from "./engineLimits.js";
import { ENTITY_KIND_NONE, ENTITY_FLAG_DEAD, ENTITY_FLAG_KINETIC, ENTITY_FLAG_ROLLS, ENTITY_FLAG_ORIENT_TO_MOTION, ENTITY_FLAG_RENDER_3D, ENTITY_FLAG_CIRCLE_SHAPE, PROP_RENDER_MODE_3D, SHAPE_TYPE_CIRCLE, ENTITY_FLAG_FRACTURE_SET, ENTITY_FLAG_FRACTURE_VAL } from "./engineEnums.js";
import { entityX, entityY, entityVx, entityVy, entityW, entityFacing, entityR, entityAgeMs, entityKind, entityFlags, entityAlive, entityGameId, entityRenderKeyId, entityRefs, entityGridTileIdx, entityRollQw, entityRollQx, entityRollQy, entityRollQz, kineticDynamicSlab, entityHeight, entityAlpha, entityFaction, entityShapeKind, entityWallProfileId, entityWallHeightPx, entityZIndex, getFactionId, getProfileId, entityFractureCooldown, entityStateTimer, entityCachedStaticKey, entityWallChunkTextureReady } from "./engineMemory.js";
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
export function worldPropBindFlags(ref) {
    let flags = 0;
    if (ref.isDead) flags |= ENTITY_FLAG_DEAD;
    const strategy = ref.strategy;
    if (strategy?.isKinetic) flags |= ENTITY_FLAG_KINETIC;
    if (strategy?.rolls) flags |= ENTITY_FLAG_ROLLS;
    if (strategy?.orientToMotion) flags |= ENTITY_FLAG_ORIENT_TO_MOTION;
    if ((strategy?.renderMode ?? PROP_RENDER_MODE_3D) === PROP_RENDER_MODE_3D) flags |= ENTITY_FLAG_RENDER_3D;
    if (ref.shape?.shapeTypeId === SHAPE_TYPE_CIRCLE) flags |= ENTITY_FLAG_CIRCLE_SHAPE;
    if (ref.fractureEnabled !== undefined) {
        flags |= ENTITY_FLAG_FRACTURE_SET;
        if (ref.fractureEnabled) flags |= ENTITY_FLAG_FRACTURE_VAL;
    }
    return flags;
}
export function releaseEntityEid(eid) {
    entityAlive[eid] = 0;
    entityKind[eid] = ENTITY_KIND_NONE;
    entityFlags[eid] = 0;
    entityGameId[eid] = -1;
    entityRenderKeyId[eid] = 0;
    entityR[eid] = 0;
    entityAgeMs[eid] = 0;
    entityRefs[eid] = null;
    entityCachedStaticKey[eid] = 0n;
    entityWallChunkTextureReady[eid] = 0;
    entityGridTileIdx[eid] = -1;
    kineticDynamicSlab.rollDriveKind[eid] = -1;
    // Clear new ECS columns
    entityHeight[eid] = 0;
    entityAlpha[eid] = 1.0;
    entityFaction[eid] = 0;
    entityShapeKind[eid] = 0;
    entityWallProfileId[eid] = 0;
    entityWallHeightPx[eid] = 0;
    entityZIndex[eid] = 10;
    entityFractureCooldown[eid] = 0;
    entityStateTimer[eid] = 0;
    eidFreeList.push(eid);
}
export function bindEntitySlot(eid, kind, ref, gameId, x, y, r, flags) {
    const sleeping = ref.isSleeping ? 1 : 0;
    const sleepFrames = ref._sleepFrames ?? 0;
    const ageMs = ref.ageMs ?? 0;
    entityAlive[eid] = 1;
    entityKind[eid] = kind;
    entityFlags[eid] = flags;
    entityGameId[eid] = gameId;
    entityRenderKeyId[eid] = ref.strategy?.renderKeyId ?? 0;
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
    entityAgeMs[eid] = ageMs;
    entityRefs[eid] = ref;
    kineticDynamicSlab.sleeping[eid] = sleeping;
    kineticDynamicSlab.sleepFrames[eid] = sleepFrames;
    kineticDynamicSlab.rollDriveKind[eid] = -1;
    // Bind new ECS columns
    entityHeight[eid] = ref.height ?? 0;
    entityAlpha[eid] = ref.alpha ?? 1.0;
    entityFaction[eid] = getFactionId(ref.faction);
    entityShapeKind[eid] = ref.shape?.shapeTypeId ?? 0;
    entityWallProfileId[eid] = getProfileId(ref.wallChunkProfileId);
    entityWallHeightPx[eid] = ref.wallChunkHeightPx ?? 0;
    entityZIndex[eid] = ref.zIndex ?? 10;
    entityFractureCooldown[eid] = ref._fractureCooldown ?? 0;
    entityStateTimer[eid] = ref.stateTimer ?? 0;
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
    delete ref._spawnSleeping;
    delete ref._spawnSleepFrames;
    delete ref._spawnAgeMs;
}
export function entitySlotRef(eid) {
    return entityAlive[eid] ? entityRefs[eid] : null;
}
