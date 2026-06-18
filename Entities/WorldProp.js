import { Entity } from "./Entity.js";
import { applyVelocityDamping } from "../Libraries/Motion/index.js";
import { IDENTITY_ROLL_QUAT } from "../Libraries/Props/rollingMotion.js";
import { integratePropMotion } from "../Libraries/Props/propMotion.js";
import { withPropStrategyDefaults } from "../Libraries/Props/propStrategy.js";
import { getPropAsset, getWorldPropDefinitions } from "../Libraries/Props/PropCatalog.js";
import { transitionEntity } from "../Libraries/FSM/transition.js";
import { WorldPropVoidSinkState } from "./worldPropVoidSinkState.js";
import { CircleShape, PolygonShape } from "../Libraries/Spatial/collision/Shapes.js";
import { MOVING_SPEED_SQ } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { addWorldPropToState } from "../GameState/EntityRegistry.js";
import { speedSqXY } from "../Libraries/Math/Vec2.js";
import { transformPoint2DInto } from "../Libraries/Math/Poly2D.js";
import { momentOfInertiaFromBody, syncKineticRigidBody } from "../Libraries/Motion/bodyMass.js";
import { applyPoxelGeometryToProp, initSplittableFootprint } from "../Libraries/Props/splittableWorldProp.js";
import { wakeKineticBody } from "../Libraries/Motion/kineticSleep.js";
import { initFloorTriggerProp } from "../Libraries/Spatial/zones/floorShapes.js";
import { initFloorButtonProp } from "../Libraries/Sandbox/floorButtons.js";
import { quantizeCardinalAngle } from "../Libraries/Math/Angle.js";
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
        if (this.strategy.halfExtents) {
            this.halfExtents = { ...this.strategy.halfExtents };
            this.radius = Math.max(this.halfExtents.x, this.halfExtents.y);
        } else this.radius = this.strategy.radius;
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.zIndex = 10;
        if (this.strategy.cardinalFacing) this.facing = quantizeCardinalAngle(facing ?? 0);
        else this.facing = facing ?? Math.random() * Math.PI * 2;
        if (this.strategy.rolls) this.rollQuat = { ...IDENTITY_ROLL_QUAT };
        if (this.strategy.randomFaceLabels) {
            const crateVisuals = getPropAsset("crate")?.visuals;
            const faces = crateVisuals?.labelFaces ?? [];
            const variants = crateVisuals?.labelVariants ?? [];
            this.faceLabelVariants = Object.fromEntries(faces.map((face) => [face, Math.floor(Math.random() * Math.max(1, variants.length))]));
        }
        if (this.strategy.localFootprint?.length >= 3) {
            const verts = this.strategy.localFootprint.map((v) => ({ x: v.x, y: v.y }));
            this.shape = new PolygonShape(verts);
            this.radius = this.shape.getBoundingRadius();
        } else if (this.strategy.collisionShape === "box") {
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
        if (this.strategy.syncCollisionShape) return this.strategy.syncCollisionShape(this);
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
    needsWallCollision() {
        return speedSqXY(this.vx, this.vy) > MOVING_SPEED_SQ;
    }
    update(dt, state, spatialFrame) {
        this.ageMs += dt;
        const asleep = this.isSleeping;
        if (!asleep)
            if (this.strategy.rolls) integratePropMotion(this, dt);
            else applyVelocityDamping(this, dt, { friction: this.strategy.friction });
        if (!asleep && this.currentState?.update) this.currentState.update(this, dt, state);
    }
    spawnSplittableFragments(gameState, fragments, { originX, originY, shardTypeId = "crate_shard", impactDirX = 0, impactDirY = 0 } = {}) {
        if (!gameState?.worldProps || fragments.length === 0) return;
        const ox = originX ?? this.x;
        const oy = originY ?? this.y;
        const parentOmega = this.angularVelocity || 0;
        const cos = Math.cos(this.facing);
        const sin = Math.sin(this.facing);
        const kick = Math.hypot(impactDirX, impactDirY) > 0 ? 35 + Math.random() * 45 : 0;
        const impactKickX = kick > 0 ? (impactDirX / Math.hypot(impactDirX, impactDirY)) * kick : 0;
        const impactKickY = kick > 0 ? (impactDirY / Math.hypot(impactDirX, impactDirY)) * kick : 0;
        for (const geom of fragments) {
            const world = transformPoint2DInto({ x: 0, y: 0 }, ox, oy, geom.centroid.cx, geom.centroid.cy, cos, sin);
            const shard = new WorldProp(world.x, world.y, shardTypeId, this.facing);
            applyPoxelGeometryToProp(shard, geom);
            let dx = world.x - ox;
            let dy = world.y - oy;
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
            shard.vx = this.vx + dx * speed + (Math.random() - 0.5) * 15 + impactKickX;
            shard.vy = this.vy + dy * speed + (Math.random() - 0.5) * 15 + impactKickY;
            const rx = world.x - ox;
            const ry = world.y - oy;
            shard.vx += -parentOmega * ry * 0.5;
            shard.vy += parentOmega * rx * 0.5;
            shard.angularVelocity = parentOmega + (Math.random() - 0.5) * 3;
            wakeKineticBody(shard);
            addWorldPropToState(gameState, shard);
        }
    }
}
