import { Segment } from "../../Entities/Wall.js";
import { createGravityZone, createCircleGroundZone, drawGroundZone, isGroundZoneInView, processGroundZones } from "../Spatial/zones/groundZones.js";
import { createVoidZone, DEFAULT_VOID_RADIUS, drawVoidZone, isInsideVoidMouth, voidMouthReach } from "../Spatial/zones/voidZone.js";
import { NEIGHBOR_QUERY_PAD } from "../Spatial/collision/entityBroadphase.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { addSandboxWalls, removeSandboxWall } from "./spawnAssembly.js";
export const SANDBOX_SPAWN_VOID = "void";
export const SANDBOX_SPAWN_PRESSURE_PLATE = "pressurePlate";
const SPAWN_ZONE_IDS = new Set([SANDBOX_SPAWN_VOID, SANDBOX_SPAWN_PRESSURE_PLATE]);
const ZONE_LABELS = { void: "void", gravity: "gravity", pressurePlate: "pressure plate" };
const PRESSURE_PLATE_RADIUS = 8;
const LINKED_WALL_HEIGHT = 1;
const LINKED_WALL_SIZE = 16;
const LINKED_WALL_OFFSET_Y = -18;
/** @param {string} spawnId */
export function isSandboxSpawnZoneId(spawnId) {
    return SPAWN_ZONE_IDS.has(spawnId);
}
/** @param {object} zone */
function syncCircleZoneAabb(zone) {
    const radius = zone.shape.radius;
    const pad = NEIGHBOR_QUERY_PAD;
    zone.aabb = { minX: zone.x - radius - pad, minY: zone.y - radius - pad, maxX: zone.x + radius + pad, maxY: zone.y + radius + pad };
}
/** @param {object} state */
function sandboxZones(state) {
    if (!state.sandboxZones) state.sandboxZones = [];
    return state.sandboxZones;
}
/** @param {number} plateX @param {number} plateY @param {string} ownerId */
function buildPressurePlateWall(plateX, plateY, ownerId) {
    const wall = new Segment(plateX, plateY + LINKED_WALL_OFFSET_Y, 0, LINKED_WALL_SIZE, 0, 30, 30, false, LINKED_WALL_HEIGHT);
    wall.collisionOnly = true;
    wall.sandboxZoneId = ownerId;
    return wall;
}
/** @param {object} state @param {object} zone @param {boolean} wallsUp */
function setPressurePlateWalls(state, zone, wallsUp) {
    if (zone.wallsUp === wallsUp) return;
    if (wallsUp) {
        zone.walls = [buildPressurePlateWall(zone.x, zone.y, zone.id)];
        addSandboxWalls(state, zone.walls, { compileRender: false });
    } else {
        for (let i = 0; i < zone.walls.length; i++) removeSandboxWall(state, zone.walls[i]);
        zone.walls = [];
    }
    zone.wallsUp = wallsUp;
}
/** @param {object} state @param {number} index */
function removeSandboxZoneAt(state, index) {
    const zone = sandboxZones(state)[index];
    if (zone.kind === "pressurePlate" && zone.wallsUp) setPressurePlateWalls(state, zone, false);
    sandboxZones(state).splice(index, 1);
}
/** @param {object} pickup @param {object} zone */
function beginVoidSink(pickup, zone) {
    if (pickup.isDead || pickup.currentStateName === "voidSink") return;
    if (typeof pickup.getShape !== "function") return;
    pickup.voidX = zone.x;
    pickup.voidY = zone.y;
    pickup.voidRadius = zone.shape.radius;
    pickup.voidDepth = zone.depth;
    pickup.voidSinkTimer = 1500;
    pickup.voidCaptured = Math.hypot(zone.x - pickup.x, zone.y - pickup.y) <= voidMouthReach(zone.shape.radius, pickup) * 0.65;
    pickup.changeState("voidSink");
}
/** @param {object} state @param {number} entityId @param {object} zone */
function rimOutVoidSink(state, entityId, zone) {
    const pickup = state.pickups.find((entry) => entry.id === entityId);
    if (!pickup || pickup.currentStateName !== "voidSink" || pickup.voidCaptured) return;
    if (isInsideVoidMouth(zone.x, zone.y, zone.shape.radius, pickup)) return;
    pickup.changeState("normal");
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {"void" | "pressurePlate" | "gravity"} kind
 * @param {number} x
 * @param {number} y
 * @param {{ radius?: number, halfWidth?: number, halfHeight?: number, forceX?: number, forceY?: number, id?: string }} [options]
 */
export function spawnSandboxZone(host, kind, x, y, options = {}) {
    const state = host.getWorldState();
    const zones = sandboxZones(state);
    /** @type {object} */
    let zone;
    if (kind === "void") zone = createVoidZone(x, y, options.radius ?? DEFAULT_VOID_RADIUS, { id: options.id ?? `void:${zones.length + 1}`, depth: options.depth });
    else if (kind === "pressurePlate") {
        zone = createCircleGroundZone(x, y, options.radius ?? PRESSURE_PLATE_RADIUS, { id: options.id ?? `pressure-plate:${zones.length + 1}:${Date.now()}` });
        zone.kind = "pressurePlate";
        syncCircleZoneAabb(zone);
        zone.wallsUp = true;
        zone.walls = [buildPressurePlateWall(x, y, zone.id)];
        addSandboxWalls(state, zone.walls, { compileRender: false });
    } else if (kind === "gravity")
        zone = createGravityZone(x, y, options.halfWidth, options.halfHeight, { id: options.id ?? `gravity:${zones.length + 1}`, forceX: options.forceX, forceY: options.forceY });
    else return null;
    zones.push(zone);
    return zone;
}
/** @param {object} state @param {string} id */
export function deleteSandboxZone(state, id) {
    const zones = sandboxZones(state);
    const index = zones.findIndex((zone) => zone.id === id);
    if (index >= 0) removeSandboxZoneAt(state, index);
}
/** @param {object} state */
export function clearSandboxZones(state) {
    const zones = sandboxZones(state);
    for (let i = zones.length - 1; i >= 0; i--) removeSandboxZoneAt(state, i);
}
/** @param {object} state */
export function listSandboxZones(state) {
    const counts = {};
    return sandboxZones(state)
        .filter((zone) => !zone.sandboxGroupId)
        .map((zone) => {
            const kind = zone.kind ?? "zone";
            counts[kind] = (counts[kind] ?? 0) + 1;
            const label = ZONE_LABELS[kind] ?? kind;
            const radius = zone.shape?.radius;
            return { id: zone.id, kind, label: `${label} #${counts[kind]}`, radius };
        });
}
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame @param {number} dt */
export function tickSandboxZones(state, spatialFrame, dt) {
    const zones = sandboxZones(state);
    if (!zones.length) return;
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (zone.kind === "void" || zone.kind === "pressurePlate") syncCircleZoneAabb(zone);
    }
    processGroundZones(spatialFrame, zones, {
        onEnter(zone, entity) {
            if (zone.kind === "void") beginVoidSink(entity, zone);
        },
        onExit(zone, entityId) {
            if (zone.kind === "void") rimOutVoidSink(state, entityId, zone);
        },
    });
    const dtSec = dt / 1000;
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (zone.kind === "gravity") {
            const forceX = zone.forceX ?? 0;
            const forceY = zone.forceY ?? 1000;
            if (forceX === 0 && forceY === 0) continue;
            for (const entityId of zone._occupants) {
                const pickup = state.pickups.find((entry) => entry.id === entityId);
                if (!pickup || pickup.isDead || pickup.strategy?.gravityImmune) continue;
                wakePushableBody(pickup);
                if (pickup.isSleeping) continue;
                pickup.vx += forceX * dtSec;
                pickup.vy += forceY * dtSec;
            }
            continue;
        }
        if (zone.kind !== "pressurePlate") continue;
        let occupied = false;
        for (const entityId of zone._occupants) {
            const pickup = state.pickups.find((entry) => entry.id === entityId);
            if (!pickup || pickup.isDead) continue;
            occupied = true;
            break;
        }
        setPressurePlateWalls(state, zone, !occupied);
    }
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../../Entities/Wall.js").Segment} wall */
function drawPressurePlateWall(ctx, wall) {
    ctx.save();
    ctx.translate(wall.x, wall.y);
    ctx.rotate(wall.angle);
    const half = wall.size / 2;
    const thickness = 4;
    ctx.fillStyle = "rgba(76, 175, 80, 0.85)";
    ctx.strokeStyle = "rgba(27, 94, 32, 1)";
    ctx.lineWidth = 2;
    ctx.fillRect(-half, -thickness / 2, wall.size, thickness);
    ctx.strokeRect(-half, -thickness / 2, wall.size, thickness);
    ctx.restore();
}
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const sandboxZoneEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx) {
        const zones = sandboxZones(state);
        if (!zones.length) return;
        ctx.save();
        for (let i = 0; i < zones.length; i++) {
            const zone = zones[i];
            if (!isGroundZoneInView(zone, viewport)) continue;
            if (zone.kind === "void") {
                drawVoidZone(ctx, zone, viewport.x, viewport.y);
                continue;
            }
            if (zone.kind === "gravity") {
                drawGroundZone(ctx, zone, { fill: "rgba(255, 100, 100, 0.05)", stroke: "rgba(255, 100, 100, 0.2)", lineWidth: 1 });
                continue;
            }
            if (zone.kind === "pressurePlate") {
                drawGroundZone(ctx, zone, { fill: "rgba(76, 175, 80, 0.35)", stroke: "rgba(27, 94, 32, 0.9)", lineWidth: 2 });
                if (zone.wallsUp) for (let w = 0; w < zone.walls.length; w++) drawPressurePlateWall(ctx, zone.walls[w]);
            }
        }
        ctx.restore();
    },
};
