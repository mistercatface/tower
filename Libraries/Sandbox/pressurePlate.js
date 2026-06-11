import { Segment } from "../../Entities/Wall.js";
import { createCircleGroundZone, drawGroundZone, isGroundZoneInView, processGroundZones } from "../Spatial/zones/groundZones.js";
import { NEIGHBOR_QUERY_PAD } from "../Spatial/collision/entityBroadphase.js";
import { addSandboxWalls, removeSandboxWall } from "./spawnAssembly.js";

export const SANDBOX_SPAWN_PRESSURE_PLATE = "pressurePlate";
export const DEFAULT_PRESSURE_PLATE_RADIUS = 8;
const LINKED_WALL_HEIGHT = 1;
const LINKED_WALL_SIZE = 16;
const LINKED_WALL_OFFSET_Y = -18;

/** @param {ReturnType<typeof createCircleGroundZone>} zone */
function syncPlateZoneAabb(zone) {
    const radius = zone.shape.radius;
    const pad = NEIGHBOR_QUERY_PAD;
    zone.aabb = { minX: zone.x - radius - pad, minY: zone.y - radius - pad, maxX: zone.x + radius + pad, maxY: zone.y + radius + pad };
}

/** @param {number} plateX @param {number} plateY @param {string} plateId */
function buildLinkedWall(plateX, plateY, plateId) {
    const wall = new Segment(plateX, plateY + LINKED_WALL_OFFSET_Y, 0, LINKED_WALL_SIZE, 0, 30, 30, false, LINKED_WALL_HEIGHT);
    wall.collisionOnly = true;
    wall.sandboxPressurePlateId = plateId;
    return wall;
}

/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {number} x
 * @param {number} y
 * @param {{ radius?: number }} [options]
 */
export function spawnPressurePlate(host, x, y, { radius = DEFAULT_PRESSURE_PLATE_RADIUS } = {}) {
    const state = host.getWorldState();
    if (!state.sandboxPressurePlates) state.sandboxPressurePlates = [];
    const id = `pressure-plate:${state.sandboxPressurePlates.length + 1}:${Date.now()}`;
    const zone = createCircleGroundZone(x, y, radius, { id: `${id}:zone` });
    zone.kind = "pressurePlate";
    syncPlateZoneAabb(zone);
    const walls = [buildLinkedWall(x, y, id)];
    addSandboxWalls(state, walls, { compileRender: false });
    const plate = { id, x, y, radius, zone, wallsUp: true, walls };
    state.sandboxPressurePlates.push(plate);
    return plate;
}

/** @param {object} state @param {string} id */
export function deletePressurePlate(state, id) {
    const plates = state.sandboxPressurePlates;
    if (!plates?.length) return;
    const index = plates.findIndex((plate) => plate.id === id);
    if (index < 0) return;
    const plate = plates[index];
    if (plate.wallsUp) for (let i = 0; i < plate.walls.length; i++) removeSandboxWall(state, plate.walls[i]);
    plates.splice(index, 1);
}

/** @param {object} state */
export function clearPressurePlates(state) {
    if (!state.sandboxPressurePlates?.length) return;
    const ids = state.sandboxPressurePlates.map((plate) => plate.id);
    for (let i = 0; i < ids.length; i++) deletePressurePlate(state, ids[i]);
}

/** @param {object} state */
export function listPressurePlates(state) {
    return (state.sandboxPressurePlates ?? []).map((plate, index) => ({
        id: plate.id,
        label: `pressure plate #${index + 1}`,
        radius: plate.radius,
    }));
}

/** @param {object} state @param {{ id: string, zone: object, wallsUp: boolean, walls: object[], x: number, y: number }} plate @param {boolean} wallsUp */
function setPlateWallsUp(state, plate, wallsUp) {
    if (plate.wallsUp === wallsUp) return;
    if (wallsUp) {
        plate.walls = [buildLinkedWall(plate.x, plate.y, plate.id)];
        addSandboxWalls(state, plate.walls, { compileRender: false });
    } else {
        for (let i = 0; i < plate.walls.length; i++) removeSandboxWall(state, plate.walls[i]);
        plate.walls = [];
    }
    plate.wallsUp = wallsUp;
}

/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame */
export function tickPressurePlates(state, spatialFrame) {
    const plates = state.sandboxPressurePlates;
    if (!plates?.length) return;
    /** @type {ReturnType<typeof createCircleGroundZone>[]} */
    const zones = [];
    for (let i = 0; i < plates.length; i++) {
        syncPlateZoneAabb(plates[i].zone);
        zones.push(plates[i].zone);
    }
    processGroundZones(spatialFrame, zones, { onEnter() {}, onExit() {} });
    for (let i = 0; i < plates.length; i++) {
        const plate = plates[i];
        let occupied = false;
        for (const entityId of plate.zone._occupants) {
            const pickup = state.pickups.find((entry) => entry.id === entityId);
            if (!pickup || pickup.isDead) continue;
            occupied = true;
            break;
        }
        setPlateWallsUp(state, plate, !occupied);
    }
}

/** @param {CanvasRenderingContext2D} ctx @param {import("../../Entities/Wall.js").Segment} wall */
function drawLinkedWall(ctx, wall) {
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
export const pressurePlateEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx) {
        const plates = state.sandboxPressurePlates;
        if (!plates?.length) return;
        ctx.save();
        for (let i = 0; i < plates.length; i++) {
            const plate = plates[i];
            if (!isGroundZoneInView(plate.zone, viewport)) continue;
            drawGroundZone(ctx, plate.zone, { fill: "rgba(76, 175, 80, 0.35)", stroke: "rgba(27, 94, 32, 0.9)", lineWidth: 2 });
            if (plate.wallsUp) for (let w = 0; w < plate.walls.length; w++) drawLinkedWall(ctx, plate.walls[w]);
        }
        ctx.restore();
    },
};
