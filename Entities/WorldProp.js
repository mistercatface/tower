import { Entity } from "./Entity.js";
import { applyVelocityDamping } from "../Libraries/Motion/index.js";
import { IDENTITY_ROLL_QUAT } from "../Libraries/Props/rollingMotion.js";
import { integratePropMotion } from "../Libraries/Props/propMotion.js";
import { initWorldPropShape, withPropStrategyDefaults } from "../Libraries/Props/propStrategy.js";
import { applyChunkGeometryToProp, applyShardGeometryToProp } from "../Libraries/Props/propFracture.js";
import { GLASS_FRACTURE_COOLDOWN_STEPS } from "../Libraries/Props/glassFracture.js";
import { addWorldPropToState } from "../GameState/EntityRegistry.js";
import { transformPoint2DInto } from "../Libraries/Math/Poly2D.js";
import { getWorldPropDefinitions } from "../Libraries/Props/PropCatalog.js";
import { transitionEntity } from "../Libraries/FSM/transition.js";
import { WorldPropVoidSinkState } from "./worldPropVoidSinkState.js";
import { isKinematicallyActive } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { momentOfInertiaFromBody, syncKineticRigidBody } from "../Libraries/Motion/bodyMass.js";
import { wakeKineticBody } from "../Libraries/Motion/kineticSleep.js";
import { initFloorTriggerProp } from "../Libraries/Spatial/zones/floorShapes.js";
import { initFloorButtonProp } from "../Libraries/Sandbox/floorButtons.js";
import { quantizeCardinalAngle } from "../Libraries/Math/Angle.js";
import { getEntityCollisionParts } from "../Libraries/Spatial/collision/SatCollision.js";
const WORLD_PROP_MODES = Object.freeze({ normal: Object.freeze({}), voidSink: new WorldPropVoidSinkState() });
function buildWorldPropStrategy(type) {
    const def = getWorldPropDefinitions()[type];
    if (!def) return withPropStrategyDefaults({});
    const { spawn, ...strategyFields } = def;
    return withPropStrategyDefaults({ ...strategyFields });
}
export class WorldProp extends Entity {
    constructor(x, y, type, facing = null) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = buildWorldPropStrategy(type);
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.zIndex = 10;
        if (this.strategy.cardinalFacing) this.facing = quantizeCardinalAngle(facing ?? 0);
        else this.facing = facing ?? Math.random() * Math.PI * 2;
        if (this.strategy.rolls) this.rollQuat = { ...IDENTITY_ROLL_QUAT };
        initWorldPropShape(this);
        if (this.strategy.floorTriggers?.length) initFloorTriggerProp(this);
        if (this.strategy.buttonLinks != null) initFloorButtonProp(this);
        if (this.strategy.isKinetic) syncKineticRigidBody(this);
        this.ageMs = 0;
        this._sleepFrames = 0;
        this.isSleeping = false;
        this.stateTimer = 0;
        this.stateData = {};
        this.changeState("normal");
    }
    get momentOfInertia() {
        return momentOfInertiaFromBody(this);
    }
    changeState(stateName, stateDataInit = null) {
        if (this.strategy?.isKinetic) wakeKineticBody(this);
        transitionEntity(this, WORLD_PROP_MODES, stateName, stateDataInit);
    }
    getShape() {
        if (typeof this.strategy.syncCollisionShape === "function") {
            const shape = this.strategy.syncCollisionShape(this);
            this.radius = shape.getBoundingRadius();
            return shape;
        }
        return this.shape;
    }
    getCollisionParts() {
        return getEntityCollisionParts(this);
    }
    get angle() {
        return this.facing;
    }
    set angle(val) {
        this.facing = val;
    }
    getRender3DKey() {
        if (this.currentState?.getRender3DKey) return this.currentState.getRender3DKey(this);
        return this.strategy.render3DKey;
    }
    needsWallCollision() {
        return isKinematicallyActive(this);
    }
    spawnFractureFragments(state, fracture, spatialFrame) {
        const cos = Math.cos(this.facing);
        const sin = Math.sin(this.facing);
        for (let i = 0; i < fracture.debris.length; i++) {
            const geom = fracture.debris[i];
            const world = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
            const frag = new WorldProp(world.x, world.y, this.type, this.facing);
            applyChunkGeometryToProp(frag, geom);
            frag.vx = this.vx;
            frag.vy = this.vy;
            frag.angularVelocity = this.angularVelocity;
            addWorldPropToState(state, frag);
            wakeKineticBody(frag);
            spatialFrame.admitKineticProp(frag, state);
        }
    }
    spawnGlassShatter(state, fracture, spatialFrame) {
        const cos = Math.cos(fracture.facing);
        const sin = Math.sin(fracture.facing);
        const impactWorld = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, fracture.impactLocal.x, fracture.impactLocal.y, cos, sin);
        const burst = Math.min(35, 8 + fracture.impactForce * 0.12);
        for (let i = 0; i < fracture.debris.length; i++) {
            const geom = fracture.debris[i];
            const world = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
            const frag = new WorldProp(world.x, world.y, this.type, fracture.facing);
            applyShardGeometryToProp(frag, geom);
            frag.vx = this.vx ?? 0;
            frag.vy = this.vy ?? 0;
            const dx = world.x - impactWorld.x;
            const dy = world.y - impactWorld.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1e-6) {
                frag.vx += (dx / dist) * burst;
                frag.vy += (dy / dist) * burst;
            }
            frag.angularVelocity = (this.angularVelocity ?? 0) + (Math.random() - 0.5) * 0.4;
            frag._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
            addWorldPropToState(state, frag);
            wakeKineticBody(frag);
            spatialFrame.admitKineticProp(frag, state);
        }
    }
    update(dt, state, spatialFrame) {
        this.ageMs += dt;
        if (this._glassFractureCooldown > 0) this._glassFractureCooldown--;
        const asleep = this.isSleeping;
        if (!asleep)
            if (this.strategy.rolls) integratePropMotion(this, dt);
            else applyVelocityDamping(this, dt, { friction: this.strategy.friction });
        if (!asleep && this.currentState?.update) this.currentState.update(this, dt, state);
    }
}
