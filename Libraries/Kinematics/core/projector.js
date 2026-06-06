import { clamp } from "../../Math/Interpolate.js";
function rotateXZ(p, bCos, bSin) {
    return { rx: p.x * bCos - p.z * bSin, rz: p.x * bSin + p.z * bCos };
}
function clampRzVis(rz, config) {
    const boundsZ = Math.max(8, config.SIZE * config.PERSPECTIVE_Z_CLAMP);
    return clamp(rz, -boundsZ, boundsZ);
}
function partScaleFromRzVis(rzVis, config) {
    return config.PERSPECTIVE_SCALE_BASE + (rzVis / config.SIZE) * config.PERSPECTIVE_SCALE_RANGE;
}
/** Project rig-local {x,y,z} to canvas space (live + corpse). */
export function projectLocalPoint(p, bCos, bSin, viewContext, config) {
    const { yFactor = 0.8, shiftX = 0, shiftY = 0, ratio = 0 } = viewContext || {};
    const cx = config.SIZE / 2;
    const groundY = config.SIZE * config.ANCHOR_Y;
    const depthWeight = Math.max(0, 0.9 - yFactor) * 4.0;
    const pos = rotateXZ(p, bCos, bSin);
    const rzVis = clampRzVis(pos.rz, config);
    const scale = partScaleFromRzVis(rzVis, config);
    const worldHeight = groundY - p.y;
    const heightNorm = worldHeight / config.SIZE;
    const dShiftX = shiftX + pos.rx * ratio;
    const dShiftY = shiftY + pos.rz * ratio;
    return { x: cx + pos.rx + dShiftX * heightNorm, y: groundY + pos.rz - worldHeight * yFactor + dShiftY * heightNorm, z: pos.rz, sortZ: rzVis - p.y * depthWeight, scale };
}
export function createProjector(viewContext, rotation, config, rig) {
    const bRot = rotation + config.BODY_OFFSET;
    const bCos = Math.cos(bRot);
    const bSin = Math.sin(bRot);
    return (p) => {
        if (p.scale !== undefined) return p;
        return projectLocalPoint(p, bCos, bSin, viewContext, config);
    };
}
