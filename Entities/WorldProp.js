import { Entity } from "./Entity.js";
import { applyVelocityDamping } from "../Libraries/Motion/applyDamping.js";
import { IDENTITY_ROLL_QUAT } from "../Libraries/Props/rollingMotion.js";
import { integratePropMotion } from "../Libraries/Props/propMotion.js";
import { buildWorldPropStrategyFromAsset, initWorldPropShape } from "../Libraries/Props/propStrategy.js";
import { transitionEntity } from "../Libraries/FSM/transition.js";
import { isKinematicallyActive } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { momentOfInertiaFromBody, syncKineticRigidBody } from "../Libraries/Motion/bodyMass.js";
import { wakeKineticBody } from "../Libraries/Motion/kineticSleep.js";
import { initFloorTriggerProp } from "../Libraries/Spatial/zones/floorShapes.js";
import { initFloorButtonProp } from "../Libraries/Sandbox/floorButtons.js";
import { quantizeCardinalAngle } from "../Libraries/Math/Angle.js";
import { getEntityCollisionParts } from "../Libraries/Spatial/collision/SatCollision.js";
import propCatalog from "../Assets/props/index.js";
const WORLD_PROP_MODES = Object.freeze({ normal: Object.freeze({}) });
export class WorldProp extends Entity {
    constructor(x, y, type, facing = null) {
        super(x, y, 0, false);
        this.type = type;
        const asset = propCatalog[type];
        this.strategy = buildWorldPropStrategyFromAsset(asset);
        this.height = asset?.visuals?.world?.height ?? 12;
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
