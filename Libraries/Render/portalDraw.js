import { gridWallEdgeEndpoints } from "../World/wallGridCells.js";
import { portalMouthAndBackCells } from "../Spatial/grid/portalAccess.js";
import { PORTAL_LINK_MODE, resolvePortalLinkRoute } from "../Sandbox/portalLinks.js";
import { getCanvasLineScale } from "./common/viewportUtils.js";
import { drawBox } from "./Props3D/SolidDraw.js";
import { projectPropVertexInto } from "./Props3D/propMesh.js";
/** @typedef {"off" | "unlinked" | "shared" | "oneWay"} PortalDrawLinkRole */
const PORTAL_STRIP_HEIGHT = 10;
const PORTAL_STRIP_THIN = 2.5;
const PORTAL_DISC_RADIUS = 2.8;
const PORTAL_DISC_BULGE = 0.2;
const PORTAL_DISC_SEGMENTS = 24;
const sEdgeP1 = { x: 0, y: 0 };
const sEdgeP2 = { x: 0, y: 0 };
const sProp = { x: 0, y: 0, facing: 0 };
const sProjected = { x: 0, y: 0, depth: 0 };
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {object} edge
 * @returns {{ powered: boolean, linkRole: PortalDrawLinkRole }}
 */
export function resolvePortalDrawRole(grid, col, row, side, edge) {
    const powered = edge.powered === true;
    if (!powered) return { powered: false, linkRole: "off" };
    const route = resolvePortalLinkRoute(grid, col, row, side);
    if (!route) return { powered: true, linkRole: "unlinked" };
    if (route.linkMode === PORTAL_LINK_MODE.Shared) return { powered: true, linkRole: "shared" };
    return { powered: true, linkRole: "oneWay" };
}
/** @param {number} side @param {number} cellHalf */
function portalStripLayout(side, cellHalf) {
    const thin = PORTAL_STRIP_THIN;
    const long = cellHalf - 1;
    if (side === 0 || side === 2) return { halfSize: { x: long, y: thin }, facing: 0 };
    return { halfSize: { x: thin, y: long }, facing: 0 };
}
/** @param {{ x: number, y: number }} halfSize */
function portalHalfStripSize(halfSize) {
    return { x: halfSize.x > halfSize.y ? halfSize.x * 0.5 : halfSize.x, y: halfSize.y > halfSize.x ? halfSize.y * 0.5 : halfSize.y };
}
/** @param {boolean} powered */
function laserWallColors(powered) {
    if (!powered) return { faceColors: { shadow: "#1e293b", mid: "#334155", highlight: "#475569" }, topColors: { light: "#64748b", mid: "#475569", dark: "#334155" }, stroke: "#0f172a" };
    return { faceColors: { shadow: "#1e1b4b", mid: "#312e81", highlight: "#4338ca" }, topColors: { light: "#a5b4fc", mid: "#6366f1", dark: "#4338ca" }, stroke: "#1e1b4b" };
}
function solidWallColors() {
    return { faceColors: { shadow: "#292524", mid: "#44403c", highlight: "#57534e" }, topColors: { light: "#78716c", mid: "#57534e", dark: "#44403c" }, stroke: "#1c1917" };
}
/**
 * @param {boolean} powered
 * @param {PortalDrawLinkRole} linkRole
 */
function statusCircleStyle(powered, linkRole) {
    if (!powered) return { fill: "rgba(100, 116, 139, 0.55)", stroke: "rgba(148, 163, 184, 0.45)" };
    if (linkRole === "unlinked") return { fill: "rgba(167, 139, 250, 0.95)", stroke: "rgba(255, 255, 255, 0.85)" };
    if (linkRole === "shared") return { fill: "rgba(34, 197, 94, 0.95)", stroke: "rgba(255, 255, 255, 0.9)" };
    return { fill: "rgba(234, 179, 8, 0.98)", stroke: "rgba(255, 255, 255, 0.9)" };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, facing: number }} prop
 * @param {number} px
 * @param {number} py
 * @param {{ x: number, y: number }} halfSize
 * @param {number} height
 * @param {number} lineScale
 * @param {boolean} powered
 */
function drawLaserGridOnTop(ctx, prop, px, py, halfSize, height, lineScale, powered) {
    const hx = halfSize.x;
    const hy = halfSize.y;
    const cos = Math.cos(prop.facing);
    const sin = Math.sin(prop.facing);
    /** @param {number} lx @param {number} ly @param {number} lz */
    function projectLocal(lx, ly, lz) {
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        return projectPropVertexInto(sProjected, prop, px, py, rx, ry, lz);
    }
    ctx.save();
    ctx.beginPath();
    const c0 = projectLocal(-hx, -hy, height);
    ctx.moveTo(c0.x, c0.y);
    const c1 = projectLocal(hx, -hy, height);
    ctx.lineTo(c1.x, c1.y);
    const c2 = projectLocal(hx, hy, height);
    ctx.lineTo(c2.x, c2.y);
    const c3 = projectLocal(-hx, hy, height);
    ctx.lineTo(c3.x, c3.y);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = powered ? "rgba(129, 140, 248, 0.55)" : "rgba(100, 116, 139, 0.35)";
    ctx.lineWidth = 0.8 * lineScale;
    const step = 4;
    for (let lx = -hx; lx <= hx; lx += step) {
        const a = projectLocal(lx, -hy, height);
        const b = projectLocal(lx, hy, height);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    for (let ly = -hy; ly <= hy; ly += step) {
        const a = projectLocal(-hx, ly, height);
        const b = projectLocal(hx, ly, height);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    ctx.restore();
}
/**
 * @param {{ x: number, y: number, facing: number }} prop
 * @param {number} targetX
 * @param {number} targetY
 * @param {{ x: number, y: number }} halfSize
 * @param {number} facing
 */
function resolveMouthFaceIndex(prop, targetX, targetY, halfSize, facing) {
    const dx = targetX - prop.x;
    const dy = targetY - prop.y;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const faces = [
        { idx: 1, dot: lx },
        { idx: 3, dot: -lx },
        { idx: 2, dot: ly },
        { idx: 0, dot: -ly },
    ];
    let pick = faces[0];
    for (let i = 1; i < faces.length; i++) if (faces[i].dot > pick.dot) pick = faces[i];
    return pick.idx;
}
/**
 * @param {number} faceIndex
 * @param {number} hx
 * @param {number} hy
 * @param {number} u
 * @param {number} lz
 */
function portalDiscLocalPoint(faceIndex, hx, hy, u, lz) {
    const bulge = PORTAL_DISC_BULGE;
    if (faceIndex === 0) return { lx: u, ly: -hy - bulge, lz };
    if (faceIndex === 1) return { lx: hx + bulge, ly: u, lz };
    if (faceIndex === 2) return { lx: u, ly: hy + bulge, lz };
    return { lx: -hx - bulge, ly: u, lz };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, facing: number }} prop
 * @param {number} px
 * @param {number} py
 * @param {number} faceIndex
 * @param {{ x: number, y: number }} halfSize
 * @param {number} height
 * @param {number} facing
 * @param {number} lineScale
 * @param {string} fill
 * @param {string} stroke
 * @param {boolean} selected
 */
function drawPortalStatusDisc3D(ctx, prop, px, py, faceIndex, halfSize, height, facing, lineScale, fill, stroke, selected) {
    const hx = halfSize.x;
    const hy = halfSize.y;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const radius = selected ? PORTAL_DISC_RADIUS * 1.15 : PORTAL_DISC_RADIUS;
    const vCenter = height * 0.5;
    /** @param {number} u @param {number} lz */
    function projectDiscPoint(u, lz) {
        const { lx, ly, lz: z } = portalDiscLocalPoint(faceIndex, hx, hy, u, lz);
        return projectPropVertexInto(sProjected, prop, px, py, lx * cos - ly * sin, lx * sin + ly * cos, z);
    }
    ctx.beginPath();
    for (let i = 0; i <= PORTAL_DISC_SEGMENTS; i++) {
        const a = (i / PORTAL_DISC_SEGMENTS) * Math.PI * 2;
        const p = projectDiscPoint(radius * Math.cos(a), vCenter + radius * Math.sin(a));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = selected ? "rgba(16, 185, 129, 0.98)" : stroke;
    ctx.lineWidth = (selected ? 2 : 1.25) * lineScale;
    ctx.stroke();
}
/**
 * Mouth-side laser strip + back-side solid wall on one portal edge.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {object} edge
 * @param {number} px
 * @param {number} py
 * @param {{ selected?: boolean }} [opts]
 */
export function drawPortalEdgeStrip(ctx, grid, col, row, side, edge, px, py, { selected = false } = {}) {
    const { powered, linkRole } = resolvePortalDrawRole(grid, col, row, side, edge);
    const { mouth, back } = portalMouthAndBackCells(col, row, side, edge);
    gridWallEdgeEndpoints(grid, col, row, side, sEdgeP1, sEdgeP2, 0);
    const midX = (sEdgeP1.x + sEdgeP2.x) * 0.5;
    const midY = (sEdgeP1.y + sEdgeP2.y) * 0.5;
    const mouthWorld = grid.gridToWorld(mouth.col, mouth.row);
    const backWorld = grid.gridToWorld(back.col, back.row);
    const cellHalf = grid.cellSize * 0.5;
    const { halfSize: fullHalf, facing } = portalStripLayout(side, cellHalf);
    const halfSize = portalHalfStripSize(fullHalf);
    const lineScale = getCanvasLineScale(ctx);
    const wallColors = solidWallColors();
    sProp.facing = facing;
    sProp.x = (midX + backWorld.x) * 0.5;
    sProp.y = (midY + backWorld.y) * 0.5;
    drawBox(ctx, sProp, px, py, {
        halfSize,
        height: PORTAL_STRIP_HEIGHT,
        facing,
        faceColors: wallColors.faceColors,
        topColors: wallColors.topColors,
        stroke: wallColors.stroke,
        lineWidth: 1.0 * lineScale,
    });
    const mouthColors = powered ? laserWallColors(true) : wallColors;
    sProp.x = (midX + mouthWorld.x) * 0.5;
    sProp.y = (midY + mouthWorld.y) * 0.5;
    drawBox(ctx, sProp, px, py, {
        halfSize,
        height: PORTAL_STRIP_HEIGHT,
        facing,
        faceColors: mouthColors.faceColors,
        topColors: mouthColors.topColors,
        stroke: mouthColors.stroke,
        lineWidth: 1.0 * lineScale,
    });
    if (powered) drawLaserGridOnTop(ctx, sProp, px, py, halfSize, PORTAL_STRIP_HEIGHT, lineScale, true);
    const faceIndex = resolveMouthFaceIndex(sProp, mouthWorld.x, mouthWorld.y, halfSize, facing);
    const circle = statusCircleStyle(powered, linkRole);
    drawPortalStatusDisc3D(ctx, sProp, px, py, faceIndex, halfSize, PORTAL_STRIP_HEIGHT, facing, lineScale, circle.fill, circle.stroke, selected);
}
