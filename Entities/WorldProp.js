import { Entity } from "./Entity.js";
import { applyVelocityDamping } from "../Libraries/Motion/index.js";
import { IDENTITY_ROLL_QUAT } from "../Libraries/Props/rollingMotion.js";
import { integratePropMotion } from "../Libraries/Props/propMotion.js";
import { HIT_BEHAVIOR_HANDLERS } from "../Libraries/Props/hitBehaviors.js";
import { initStandTipState, isStandTipActive } from "../Libraries/Props/standTipMotion.js";
import { withPropStrategyDefaults } from "../Libraries/Props/propStrategy.js";
import { getPropAsset, getWorldPropDefinitions } from "../Libraries/Props/PropCatalog.js";
import { transitionEntity } from "../Libraries/FSM/transition.js";
import { WorldPropDeadState } from "./worldPropCombatStates.js";
import { WorldPropVoidSinkState } from "./worldPropVoidSinkState.js";
import { CircleShape, PolygonShape } from "../Libraries/Spatial/collision/Shapes.js";
import { transformPoint2DInto } from "../Libraries/Math/Poly2D.js";
import { syncLongAxisCollisionShape } from "../Libraries/Props/longAxisCollision.js";
import { isStandTipProp } from "../Libraries/Spatial/transforms/longAxisBox3d.js";
import { MOVING_SPEED_SQ } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { addWorldPropToState } from "../GameState/EntityRegistry.js";
import { speedSqXY } from "../Libraries/Math/Vec2.js";
import { resolveBodyRadius } from "../Libraries/Motion/bodyDefaults.js";
import { applyPoxelGeometryToProp, initSplittableFootprint, splitFootprintIntoComponents } from "../Libraries/Props/splittableWorldProp.js";
import { wakePushableBody } from "../Libraries/Motion/pushableSleep.js";
import { ensureLocomotionWorldProp, updateLocomotionWorldProp, usesLocomotionWorldProp } from "../Libraries/Props/locomotionWorldProp.js";
import { initFloorTriggerProp } from "../Libraries/Spatial/zones/floorShapes.js";
import { initFloorButtonProp } from "../Libraries/Sandbox/floorButtons.js";
import { quantizeCardinalAngle } from "../Libraries/Math/Angle.js";
class WorldPropNormalState {
    getRender3DKey(prop) {
        return prop.strategy.render3DKey;
    }
}
/** Modes owned by WorldProp — not registered or mutated from app boot. */
const WORLD_PROP_MODES = Object.freeze({ normal: new WorldPropNormalState(), dead: new WorldPropDeadState(), voidSink: new WorldPropVoidSinkState() });
function buildWorldPropStrategy(type) {
    const def = getWorldPropDefinitions()[type];
    if (!def) return withPropStrategyDefaults({});
    const { hitBehavior, spawn, ...strategyFields } = def;
    return withPropStrategyDefaults({ ...strategyFields, onHit: HIT_BEHAVIOR_HANDLERS[hitBehavior] ?? HIT_BEHAVIOR_HANDLERS.none });
}
export class WorldProp extends Entity {
    constructor(x, y, type, facing = null) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = buildWorldPropStrategy(type);
        if (this.strategy.halfExtents) {
            this.halfExtents = { ...this.strategy.halfExtents };
            if (!this.strategy.standTip) this.radius = Math.max(this.halfExtents.x, this.halfExtents.y);
            else this.radius = this.strategy.radius ?? this.halfExtents.x;
        } else this.radius = this.strategy.radius;
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.mass = this.strategy.mass;
        this.zIndex = 10;
        if (this.strategy.cardinalFacing) this.facing = quantizeCardinalAngle(facing ?? 0);
        else this.facing = facing ?? Math.random() * Math.PI * 2;
        if (this.strategy.standTip) {
            this._baseRadius = this.radius;
            initStandTipState(this);
        } else if (this.strategy.rolls) {
            this.rollQuat = { ...IDENTITY_ROLL_QUAT };
            this.rollAngle = 0;
        }
        if (this.strategy.randomFaceLabels) {
            const crateVisuals = getPropAsset("crate")?.visuals;
            const faces = crateVisuals?.labelFaces ?? [];
            const variants = crateVisuals?.labelVariants ?? [];
            this.faceLabelVariants = Object.fromEntries(faces.map((face) => [face, Math.floor(Math.random() * Math.max(1, variants.length))]));
        }
        if (this.strategy.collisionShape === "box") {
            const hx = this.halfExtents?.x ?? this.radius;
            const hy = this.halfExtents?.y ?? this.radius;
            this.shape = new PolygonShape([
                { x: -hx, y: -hy },
                { x: hx, y: -hy },
                { x: hx, y: hy },
                { x: -hx, y: hy },
            ]);
            if (this.strategy.splittable) initSplittableFootprint(this);
        }
        if (this.strategy.maxHealth != null) {
            this.maxHealth = this.strategy.maxHealth;
            this.health = this.strategy.maxHealth;
        }
        if (this.strategy.floorTriggers?.length) initFloorTriggerProp(this);
        if (this.strategy.buttonLinks != null) initFloorButtonProp(this);
        this.usesKinematicsBody = !!this.strategy.kinematics;
        if (usesLocomotionWorldProp(this)) ensureLocomotionWorldProp(this);
        if (getPropAsset(type)?.sandbox?.equip) {
            this.weaponLoadout = [];
            this.weaponSlotState = [];
        }
        this.ageMs = 0;
        this._sleepFrames = 0;
        this.isSleeping = false;
        this.stateTimer = 0;
        this.stateData = {};
        this.changeState("normal");
    }
    get momentOfInertia() {
        const m = this.mass || 1.0;
        if (isStandTipProp(this) && !this.isFallen) {
            const r = resolveBodyRadius(this);
            const h = this.strategy.rollHeight ?? this.strategy.uprightHeight ?? r * 2.5;
            return m * (r * r * 0.25 + (h * h) / 3);
        }
        if (isStandTipProp(this) && this.isFallen && this.halfExtents) {
            const w = this.halfExtents.x * 2;
            const h = this.halfExtents.y * 2;
            return (m * (w * w + h * h)) / 12;
        }
        if (this.shape && this.shape.type === "Polygon") {
            if (this.strategy.rollAxis === "long" && this.halfExtents) {
                const crossW = this.halfExtents.y * 2;
                const crossH = this.strategy.rollHeight ?? 3;
                return (m * (crossW * crossW + crossH * crossH)) / 12;
            }
            const w = this.halfExtents ? this.halfExtents.x * 2 : this.radius * 2;
            const h = this.halfExtents ? this.halfExtents.y * 2 : this.radius * 2;
            return (m * (w * w + h * h)) / 12;
        }
        return (m * this.radius * this.radius) / 2;
    }
    changeState(stateName, stateDataInit = null) {
        if (this.strategy?.isPushable) wakePushableBody(this);
        transitionEntity(this, WORLD_PROP_MODES, stateName, stateDataInit);
    }
    getShape() {
        if (this.strategy.syncCollisionShape) return this.strategy.syncCollisionShape(this);
        if (isStandTipProp(this)) return syncLongAxisCollisionShape(this);
        if (this.shape) return this.shape;
        if (this.strategy.collisionShape === "box" && this.halfExtents) {
            const hx = this.halfExtents.x;
            const hy = this.halfExtents.y;
            this.shape = new PolygonShape([
                { x: -hx, y: -hy },
                { x: hx, y: -hy },
                { x: hx, y: hy },
                { x: -hx, y: hy },
            ]);
            return this.shape;
        }
        this.shape = new CircleShape(this.radius || 0);
        return this.shape;
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
    handleHit(damage, state) {
        return this.takeDamage(damage, state);
    }
    takeDamage(amount, gameState) {
        if (this.maxHealth == null || this.isDead) return false;
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.die(gameState);
            return true;
        }
        return false;
    }
    die(gameState) {
        if (this.isDead || this.currentStateName === "dead") return;
        this.changeState("dead", { gameState });
    }
    needsWallCollision() {
        return speedSqXY(this.vx, this.vy) > MOVING_SPEED_SQ;
    }
    update(dt, state, spatialFrame, resolveWalls = false) {
        this.ageMs += dt;
        const asleep = this.isSleeping && (!this.strategy?.standTip || !isStandTipActive(this));
        if (!asleep)
            if (updateLocomotionWorldProp(this, dt, spatialFrame)) {
                // integrateSteering (Libraries/Motion)
            } else if (this.strategy.rolls || this.strategy.standTip) integratePropMotion(this, dt);
            else applyVelocityDamping(this, dt, { friction: this.strategy.friction });
        if (this.usesKinematicsBody) {
            if (!usesLocomotionWorldProp(this)) {
                const speed = Math.hypot(this.vx, this.vy);
                if (speed > 2) {
                    const targetAngle = Math.atan2(this.vy, this.vx);
                    let angleDiff = Math.atan2(Math.sin(targetAngle - this.facing), Math.cos(targetAngle - this.facing));
                    const turnSpeed = 10;
                    this.facing += angleDiff * Math.min(1, turnSpeed * (dt / 1000));
                }
            }
            if (this.turrets?.length)
                if (this.weaponLoadout?.length > 0) {
                    const aimAngle = this.turrets[0]?.angle;
                    if (aimAngle != null) this.facing = aimAngle;
                } else {
                    const facing = this.facing ?? this.angle ?? 0;
                    for (const turret of this.turrets) turret.angle = facing;
                }
        }
        if (!asleep && resolveWalls && this.strategy.isPushable && this.needsWallCollision()) state.wallResolver.resolve(this, spatialFrame);
        if (!asleep && this.currentState?.update) this.currentState.update(this, dt, state);
    }
    spawnShards(gameState) {
        if (!gameState?.worldProps) return;
        if (!this.poxels?.length) return;
        const parentArea = this.footprintArea || 1;
        const parentMass = this.mass || 1;
        const parentOmega = this.angularVelocity || 0;
        const cos = Math.cos(this.facing);
        const sin = Math.sin(this.facing);
        const fragments = splitFootprintIntoComponents(this, 0, 0, 20, true);
        for (const geom of fragments) {
            const world = transformPoint2DInto({ x: 0, y: 0 }, this.x, this.y, geom.centroid.cx, geom.centroid.cy, cos, sin);
            const shard = new WorldProp(world.x, world.y, "crate_shard", this.facing);
            applyPoxelGeometryToProp(shard, geom);
            shard.mass = parentMass * (geom.footprintArea / parentArea);
            let dx = world.x - this.x;
            let dy = world.y - this.y;
            let dist = Math.hypot(dx, dy);
            if (dist > 0) {
                dx /= dist;
                dy /= dist;
            } else {
                const angle = Math.random() * Math.PI * 2;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
            }
            const speed = 40 + Math.random() * 60;
            shard.vx = this.vx + dx * speed + (Math.random() - 0.5) * 15;
            shard.vy = this.vy + dy * speed + (Math.random() - 0.5) * 15;
            const rx = world.x - this.x;
            const ry = world.y - this.y;
            shard.vx += -parentOmega * ry * 0.5;
            shard.vy += parentOmega * rx * 0.5;
            shard.angularVelocity = parentOmega + (Math.random() - 0.5) * 3;
            wakePushableBody(shard);
            addWorldPropToState(gameState, shard);
        }
    }
}
