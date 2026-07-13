import { PRIMITIVE_PHYSICS_ROW_CIRCLE, PRIMITIVE_PHYSICS_ROW_POLYGON } from "../../Core/engineEnums.js";
import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { KineticSpatialFrame } from "../../Libraries/Spatial/spatial.js";
import { CircleShape, normalizeKineticBody, createKineticSession, stampPrimitivePhysics, kineticInertiaFromBody, invalidateKineticShapeGeom, computeFootprintIdFromSlab } from "../../Libraries/Physics/physics.js";
import { clearWorldPropSpawnPose, worldPropBindFlags, noteEntityEidHighWater } from "../../Core/entitySlots.js";
import { entityX, entityY, entityVx, entityVy, entityW, entityFacing, entityR, entityRollQw, entityRollQx, entityRollQy, entityRollQz, entityAgeMs, entityRefs, entityFlags, entityRenderKeyId, entityAlive, kineticStaticSlab, kineticDynamicSlab, entityHeight, entityAlpha, entityShapeKind, entityWallProfileId, entityWallHeightPx, getProfileId, entityFractureCooldown, entityFootprintId, entityGameId } from "../../Core/engineMemory.js";
import { ROLL_DRIVE_NONE, SHAPE_TYPE_CIRCLE, ENTITY_FLAG_FRACTURE_SET, ENTITY_FLAG_FRACTURE_VAL } from "../../Core/engineEnums.js";
export function snapshotKineticBodySlab(eids, count = eids.length) {
    for (let i = 0; i < count; i++) {
        const eid = eids[i];
        const entity = entityRefs[eid];
        if (!entity) continue;
        if (kineticDynamicSlab.partGeomOffset[eid] < 0) normalizeKineticBody(entity);
        if (kineticDynamicSlab.shapeKind[eid] !== SHAPE_TYPE_CIRCLE) {
            const angle = entityFacing[eid];
            kineticDynamicSlab.cos[eid] = Math.cos(angle);
            kineticDynamicSlab.sin[eid] = Math.sin(angle);
        }
    }
}
let nextMockPhysId = 0;
export function resetMockPhysId(next = 0) {
    nextMockPhysId = next;
}
function attachSleepAccessors(body) {
    Object.defineProperties(body, {
        isSleeping: {
            get() {
                return kineticDynamicSlab.sleeping[this._physId] !== 0;
            },
            set(v) {
                kineticDynamicSlab.sleeping[this._physId] = v ? 1 : 0;
            },
            enumerable: true,
            configurable: true,
        },
        _sleepFrames: {
            get() {
                return kineticDynamicSlab.sleepFrames[this._physId];
            },
            set(v) {
                kineticDynamicSlab.sleepFrames[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
        ageMs: {
            get() {
                return entityAgeMs[this._physId];
            },
            set(v) {
                entityAgeMs[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
    });
}
function attachRollAccessors(body) {
    Object.defineProperties(body, {
        rollQw: {
            get() {
                return this._physId !== undefined ? entityRollQw[this._physId] : (this._spawnRollQw ?? 1);
            },
            set(v) {
                if (this._physId !== undefined) entityRollQw[this._physId] = v;
                else this._spawnRollQw = v;
            },
            enumerable: true,
            configurable: true,
        },
        rollQx: {
            get() {
                return this._physId !== undefined ? entityRollQx[this._physId] : (this._spawnRollQx ?? 0);
            },
            set(v) {
                if (this._physId !== undefined) entityRollQx[this._physId] = v;
                else this._spawnRollQx = v;
            },
            enumerable: true,
            configurable: true,
        },
        rollQy: {
            get() {
                return this._physId !== undefined ? entityRollQy[this._physId] : (this._spawnRollQy ?? 0);
            },
            set(v) {
                if (this._physId !== undefined) entityRollQy[this._physId] = v;
                else this._spawnRollQy = v;
            },
            enumerable: true,
            configurable: true,
        },
        rollQz: {
            get() {
                return this._physId !== undefined ? entityRollQz[this._physId] : (this._spawnRollQz ?? 0);
            },
            set(v) {
                if (this._physId !== undefined) entityRollQz[this._physId] = v;
                else this._spawnRollQz = v;
            },
            enumerable: true,
            configurable: true,
        },
    });
}
function attachPoseAccessors(body) {
    Object.defineProperties(body, {
        x: {
            get() {
                return entityX[this._physId];
            },
            set(v) {
                entityX[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
        y: {
            get() {
                return entityY[this._physId];
            },
            set(v) {
                entityY[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
        vx: {
            get() {
                return entityVx[this._physId];
            },
            set(v) {
                entityVx[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
        vy: {
            get() {
                return entityVy[this._physId];
            },
            set(v) {
                entityVy[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
        angularVelocity: {
            get() {
                return entityW[this._physId];
            },
            set(v) {
                entityW[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
        facing: {
            get() {
                return entityFacing[this._physId];
            },
            set(v) {
                entityFacing[this._physId] = v;
            },
            enumerable: true,
            configurable: true,
        },
    });
}
export function assignPhysIdWithPose(body, physId) {
    const x = body.x;
    const y = body.y;
    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const w = body.angularVelocity ?? 0;
    const facing = body.facing ?? 0;
    const rqw = body.rollQw ?? body._spawnRollQw ?? 1;
    const rqx = body.rollQx ?? body._spawnRollQx ?? 0;
    const rqy = body.rollQy ?? body._spawnRollQy ?? 0;
    const rqz = body.rollQz ?? body._spawnRollQz ?? 0;
    const sleeping = body.isSleeping ? 1 : 0;
    const sleepFrames = body._sleepFrames ?? 0;
    const ageMs = body.isKineticDebris ? 0 : (body.ageMs ?? 0);
    // Evaluate ECS properties before body._physId is set
    const height = body.height ?? 0;
    const alpha = body.isKineticDebris ? 1.0 : (body.alpha ?? 1.0);
    const shapeKind = body.shape?.shapeTypeId ?? 0;
    const wallProfileId = body.wallChunkProfileId;
    const wallHeightPx = body.wallChunkHeightPx ?? 0;
    const fractureCooldown = body._fractureCooldown ?? 0;
    // Evaluate flags before body._physId is set
    const flags = worldPropBindFlags(body);

    body._physId = physId;
    noteEntityEidHighWater(physId);
    invalidateKineticShapeGeom(physId);
    entityRefs[physId] = body;
    entityAlive[physId] = 1;
    entityX[physId] = x;
    entityY[physId] = y;
    entityVx[physId] = vx;
    entityVy[physId] = vy;
    entityW[physId] = w;
    entityFacing[physId] = facing;
    entityR[physId] = body.radius ?? 0;
    normalizeKineticBody(body);
    entityRollQw[physId] = rqw;
    entityRollQx[physId] = rqx;
    entityRollQy[physId] = rqy;
    entityRollQz[physId] = rqz;
    entityAgeMs[physId] = ageMs;
    kineticDynamicSlab.sleeping[physId] = sleeping;
    kineticDynamicSlab.sleepFrames[physId] = sleepFrames;
    kineticDynamicSlab.rollDriveKind[physId] = ROLL_DRIVE_NONE;
    entityFlags[physId] = flags;
    entityRenderKeyId[physId] = body.strategy?.renderKeyId ?? 0;
    // Populate new ECS SoA columns
    entityHeight[physId] = height;
    entityAlpha[physId] = alpha;
    entityShapeKind[physId] = shapeKind;
    entityWallProfileId[physId] = getProfileId(wallProfileId);
    entityWallHeightPx[physId] = wallHeightPx;
    entityFractureCooldown[physId] = fractureCooldown;
    entityFootprintId[physId] = computeFootprintIdFromSlab(physId);
    if (body.strategy?.physicsRow != null) kineticStaticSlab.physicsRow[physId] = body.strategy.physicsRow;
    if (body.id != null) {
        kineticStaticSlab.entityId[physId] = body.id;
        entityGameId[physId] = body.id;
    }
    if (!body.isKineticDebris) {
        attachPoseAccessors(body);
        attachSleepAccessors(body);
    }
    clearWorldPropSpawnPose(body);
    return physId;
}
export function mockKineticBody(isSleeping = false) {
    const radius = 10;
    const body = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angularVelocity: 0,
        radius,
        isSleeping,
        isDead: false,
        strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_CIRCLE),
        _sleepFrames: 0,
        get momentOfInertia() {
            return kineticInertiaFromBody(this);
        },
        shape: new CircleShape(radius),
    };
    assignPhysIdWithPose(body, nextMockPhysId++);
    normalizeKineticBody(body);
    return body;
}
export function mockCircleProp(x, y, radius) {
    const body = {
        id: 1,
        x,
        y,
        vx: 0,
        vy: 0,
        angularVelocity: 0,
        radius,
        isSleeping: false,
        isDead: false,
        strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_CIRCLE),
        get momentOfInertia() {
            return kineticInertiaFromBody(this);
        },
        shape: new CircleShape(radius),
    };
    normalizeKineticBody(body);
    return body;
}
export const noop = () => {};
export const kineticPipelineStubs = { resolveWalls: noop, applyContactSideEffects: noop, updatePropFrame: noop };
export function kineticPhysicsHooks(overrides = {}) {
    return { ...kineticPipelineStubs, ...overrides };
}
let nextMockKineticCircleId = 1;
let nextMockBallId = 1;
export function resetMockKineticCircleIds(next = 1) {
    nextMockKineticCircleId = next;
}
export function resetMockBallIds(next = 1) {
    nextMockBallId = next;
}
export function mockBall(x, y, overrides = {}) {
    const shape = overrides.shape ?? new CircleShape(4);
    const body = { id: overrides.id ?? nextMockBallId++, x, y, vx: 0, vy: 0, angularVelocity: 0, radius: shape.radius, type: "ball", shape, ...overrides };
    body.strategy = stampPrimitivePhysics({ isKinetic: true, ...body.strategy }, PRIMITIVE_PHYSICS_ROW_CIRCLE);
    normalizeKineticBody(body);
    return body;
}
export function mockRollingProp(overrides = {}) {
    const body = { id: 1, x: 0, y: 0, vx: 0, vy: 0, angularVelocity: 0, radius: 8, isSleeping: false, shape: new CircleShape(8), ...overrides };
    body.strategy = stampPrimitivePhysics({ rolls: true, isKinetic: true, ...(overrides.strategy || {}) }, PRIMITIVE_PHYSICS_ROW_CIRCLE);
    body._spawnRollQw = body._spawnRollQw ?? 1;
    body._spawnRollQx = body._spawnRollQx ?? 0;
    body._spawnRollQy = body._spawnRollQy ?? 0;
    body._spawnRollQz = body._spawnRollQz ?? 0;
    attachRollAccessors(body);
    if (body._physId === undefined) assignPhysIdWithPose(body, nextMockPhysId++);
    else {
        entityRollQw[body._physId] = body._spawnRollQw ?? 1;
        entityRollQx[body._physId] = body._spawnRollQx ?? 0;
        entityRollQy[body._physId] = body._spawnRollQy ?? 0;
        entityRollQz[body._physId] = body._spawnRollQz ?? 0;
    }
    normalizeKineticBody(body);
    return body;
}
export function mockKineticCircle(x, y, radius, vx = 0, vy = 0, options = {}) {
    const strategy = stampPrimitivePhysics({ isKinetic: true, ...options.strategy }, PRIMITIVE_PHYSICS_ROW_CIRCLE);
    const shape = options.sharedShape ? new CircleShape(radius) : null;
    const body = {
        id: options.id ?? nextMockKineticCircleId++,
        x,
        y,
        radius,
        vx,
        vy,
        angularVelocity: options.angularVelocity ?? 0,
        isSleeping: false,
        _sleepFrames: 0,
        strategy,
        get momentOfInertia() {
            return kineticInertiaFromBody(this);
        },
        shape: shape ?? new CircleShape(radius),
        _overridePairFriction: options.pairFriction,
        _overridePairRestitution: options.pairRestitution,
    };
    if (options.facing != null) body.facing = options.facing;
    if (options.isDead) body.isDead = true;
    body.currentState = options.currentState === true || options.currentState == null ? {} : options.currentState;
    if (options.dampedMotion)
        body.update = function update(dt) {
            this.x += (this.vx ?? 0) * (dt / 1000);
            this.y += (this.vy ?? 0) * (dt / 1000);
            this.vx *= 0.02;
            this.vy *= 0.02;
        };
    else if (options.update) body.update = options.update;
    normalizeKineticBody(body);
    return body;
}
function applyHarnessPairOverrides(bodies) {
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        if (body._overridePairFriction != null) kineticStaticSlab.friction[physId] = body._overridePairFriction;
        if (body._overridePairRestitution != null) kineticStaticSlab.restitution[physId] = body._overridePairRestitution;
    }
}
export function createKineticTestRegistry(liveProps) {
    return {
        membershipGen: 0,
        entityMeta: [],
        getLive(id) {
            for (let i = 0; i < liveProps.length; i++) if (liveProps[i].id === id) return liveProps[i];
            return null;
        },
        register(_kind, prop) {
            if (!liveProps.includes(prop)) liveProps.push(prop);
        },
        unregister(prop) {
            const index = liveProps.indexOf(prop);
            if (index >= 0) liveProps.splice(index, 1);
        },
        beginMembershipBatch() {},
        endMembershipBatch() {},
    };
}
export function createKineticTestWorld(initialProps, { constraintsDirty = false } = {}) {
    const worldProps = initialProps.slice();
    const liveProps = initialProps.slice();
    const world = { worldProps, entityRegistry: createKineticTestRegistry(liveProps), kinetic: createKineticSession({ constraintsDirty }) };
    world.obstacleGrid = { floorBeltCount: 0, activePortalCount: 0 };
    world.fractureEngine = new FractureEngine(world);
    return world;
}
export function setupKineticTestFrame(bodies, cellSize = 50) {
    const frame = new KineticSpatialFrame(cellSize);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    frame.kineticEidCount = 0;
    for (let i = 0; i < bodies.length; i++) {
        assignPhysIdWithPose(bodies[i], i);
        frame.insertEid(i);
        frame._pushKineticEid(i);
    }
    noteEntityEidHighWater(bodies.length - 1);
    snapshotKineticBodySlab(frame.kineticEids, frame.kineticEidCount);
    applyHarnessPairOverrides(bodies);
    frame.syncActiveKineticBodies();
    return frame;
}
export function createKineticTestTick(initialProps, options = {}) {
    const world = createKineticTestWorld(initialProps, options);
    const frame = setupKineticTestFrame(initialProps, options.cellSize);
    return { frame, world };
}
export function attachKineticTestTickFromState(state, props, cellSize = state.obstacleGrid?.cellSize ?? 16) {
    const frame = new KineticSpatialFrame(cellSize);
    frame.resetFrame(state.obstacleGrid);
    frame.kineticEidCount = 0;
    for (let i = 0; i < props.length; i++) {
        assignPhysIdWithPose(props[i], i);
        frame.insertEid(i);
        frame._pushKineticEid(i);
    }
    noteEntityEidHighWater(props.length - 1);
    snapshotKineticBodySlab(frame.kineticEids, frame.kineticEidCount);
    applyHarnessPairOverrides(props);
    frame.syncActiveKineticBodies();
    return { frame, world: { worldProps: state.worldProps, entityRegistry: state.entityRegistry, kinetic: state.kinetic, sandbox: state.sandbox } };
}
export function snapshotKineticBodies(...bodies) {
    const eids = bodies.map((b) => b._physId);
    snapshotKineticBodySlab(eids, eids.length);
}
