import { gridWallEdgeEndpoints } from "../Spatial/grid/gridCellTopology.js";
import { portalMouthAndBackCells } from "../Spatial/grid/portalAccess.js";
import { PORTAL_LINK_MODE, resolvePortalLinkRoute } from "../Sandbox/portalLinks.js";
import { getCanvasLineScale } from "./common/viewportUtils.js";
import { drawBox } from "./Props3D/SolidDraw.js";
import { projectPropVertexInto } from "./Props3D/propMesh.js";
import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
/** @typedef {"off" | "unlinked" | "shared" | "oneWayDepart" | "oneWayReceive"} PortalDrawLinkRole */
const PORTAL_STRIP_HEIGHT = 10;
const PORTAL_STRIP_THIN = 1.2;
const PORTAL_DISC_RADIUS = 2.8;
const PORTAL_DISC_BULGE = 0.05;
const PORTAL_DISC_SEGMENTS = 24;
const sEdgeP1 = { x: 0, y: 0 };
const sEdgeP2 = { x: 0, y: 0 };
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
    const isSource = route.source.col === col && route.source.row === row && route.source.side === side;
    return { powered: true, linkRole: isSource ? "oneWayDepart" : "oneWayReceive" };
}
/** @param {number} side @param {number} cellHalf */
function portalStripLayout(side, cellHalf) {
    const thin = PORTAL_STRIP_THIN;
    const long = cellHalf - 1;
    if (side === 0 || side === 2) return { halfSize: { x: long, y: thin }, facing: 0 };
    return { halfSize: { x: thin, y: long }, facing: 0 };
}
function getFrameColors(powered) {
    if (!powered) return { faceColors: { shadow: "#1e293b", mid: "#334155", highlight: "#475569" }, topColors: { light: "#64748b", mid: "#475569", dark: "#334155" }, stroke: "#0f172a" };
    return { faceColors: { shadow: "#1e1b4b", mid: "#312e81", highlight: "#4338ca" }, topColors: { light: "#a5b4fc", mid: "#6366f1", dark: "#4338ca" }, stroke: "#0f0b38" };
}
function getScreenColors(powered) {
    if (!powered) return { faceColors: { shadow: "#111827", mid: "#1f2937", highlight: "#374151" }, topColors: { light: "#374151", mid: "#1f2937", dark: "#111827" }, stroke: "#0b0f19" };
    return { faceColors: { shadow: "#090d16", mid: "#0f172a", highlight: "#1e293b" }, topColors: { light: "#334155", mid: "#1e293b", dark: "#0f172a" }, stroke: "#090d16" };
}
function getPortalMouthColors(linkRole) {
    if (linkRole === "unlinked") return { outer: "rgba(167, 139, 250, 0.25)", mid: "rgba(139, 92, 246, 0.55)", inner: "rgba(124, 58, 237, 0.85)", center: "#f5f3ff" };
    if (linkRole === "shared" || linkRole === "oneWayDepart") return { outer: "rgba(74, 222, 128, 0.25)", mid: "rgba(34, 197, 94, 0.55)", inner: "rgba(22, 163, 74, 0.85)", center: "#f0fdf4" };
    if (linkRole === "oneWayReceive") return { outer: "rgba(251, 146, 60, 0.25)", mid: "rgba(249, 115, 22, 0.55)", inner: "rgba(234, 88, 12, 0.85)", center: "#fff7ed" };
    return { outer: "rgba(148, 163, 184, 0.25)", mid: "rgba(100, 116, 139, 0.55)", inner: "rgba(71, 85, 105, 0.85)", center: "#f8fafc" };
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
function drawPortalVortex(ctx, prop, px, py, faceIndex, halfSize, height, facing, lineScale, linkRole, ageMs, selected) {
    const hx = halfSize.x;
    const hy = halfSize.y;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const rx = faceIndex === 0 || faceIndex === 2 ? hx - 0.6 : hy - 0.6;
    const ry = height * 0.4;
    const vCenter = height * 0.5;
    /** @param {number} u @param {number} lz */
    function projectDiscPoint(u, lz) {
        const { lx, ly, lz: z } = portalDiscLocalPoint(faceIndex, hx, hy, u, lz);
        return projectPropVertexInto(sProjected, prop, px, py, lx * cos - ly * sin, lx * sin + ly * cos, z);
    }
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= PORTAL_DISC_SEGMENTS; i++) {
        const a = (i / PORTAL_DISC_SEGMENTS) * Math.PI * 2;
        const p = projectDiscPoint(rx * Math.cos(a), vCenter + ry * Math.sin(a));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.fillStyle = "#09090b";
    ctx.fill();
    const colors = getPortalMouthColors(linkRole);
    const steps = [
        { rScale: 1.0, fill: colors.outer },
        { rScale: 0.75, fill: colors.mid },
        { rScale: 0.5, fill: colors.inner },
        { rScale: 0.25, fill: colors.center },
    ];
    for (const step of steps) {
        ctx.beginPath();
        const curRx = rx * step.rScale;
        const curRy = ry * step.rScale;
        for (let i = 0; i <= PORTAL_DISC_SEGMENTS; i++) {
            const a = (i / PORTAL_DISC_SEGMENTS) * Math.PI * 2;
            const p = projectDiscPoint(curRx * Math.cos(a), vCenter + curRy * Math.sin(a));
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.fillStyle = step.fill;
        ctx.fill();
    }
    const timeSec = ageMs / 1000;
    const t = (timeSec * 1.2) % 1.0;
    const ringRx = rx * t;
    const ringRy = ry * t;
    ctx.strokeStyle = colors.center;
    ctx.lineWidth = 1.0 * lineScale;
    ctx.globalAlpha = 1.0 - t;
    ctx.beginPath();
    for (let i = 0; i <= PORTAL_DISC_SEGMENTS; i++) {
        const a = (i / PORTAL_DISC_SEGMENTS) * Math.PI * 2;
        const p = projectDiscPoint(ringRx * Math.cos(a), vCenter + ringRy * Math.sin(a));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = selected ? "rgba(16, 185, 129, 0.98)" : colors.inner;
    ctx.lineWidth = (selected ? 2.5 : 1.5) * lineScale;
    ctx.beginPath();
    for (let i = 0; i <= PORTAL_DISC_SEGMENTS; i++) {
        const a = (i / PORTAL_DISC_SEGMENTS) * Math.PI * 2;
        const p = projectDiscPoint(rx * Math.cos(a), vCenter + ry * Math.sin(a));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
}
function drawPortalVortexInactive(ctx, prop, px, py, faceIndex, halfSize, height, facing, lineScale, selected) {
    const hx = halfSize.x;
    const hy = halfSize.y;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const rx = faceIndex === 0 || faceIndex === 2 ? hx - 0.6 : hy - 0.6;
    const ry = height * 0.4;
    const vCenter = height * 0.5;
    /** @param {number} u @param {number} lz */
    function projectDiscPoint(u, lz) {
        const { lx, ly, lz: z } = portalDiscLocalPoint(faceIndex, hx, hy, u, lz);
        return projectPropVertexInto(sProjected, prop, px, py, lx * cos - ly * sin, lx * sin + ly * cos, z);
    }
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= PORTAL_DISC_SEGMENTS; i++) {
        const a = (i / PORTAL_DISC_SEGMENTS) * Math.PI * 2;
        const p = projectDiscPoint(rx * Math.cos(a), vCenter + ry * Math.sin(a));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = selected ? "rgba(16, 185, 129, 0.98)" : "#475569";
    ctx.lineWidth = (selected ? 2.0 : 1.25) * lineScale;
    ctx.beginPath();
    for (let i = 0; i <= PORTAL_DISC_SEGMENTS; i++) {
        const a = (i / PORTAL_DISC_SEGMENTS) * Math.PI * 2;
        const p = projectDiscPoint(rx * Math.cos(a), vCenter + ry * Math.sin(a));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
}
function drawPortalBackPanel(ctx, prop, px, py, faceIndex, halfSize, height, facing, lineScale, selected) {
    const hx = halfSize.x;
    const hy = halfSize.y;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const rx = faceIndex === 0 || faceIndex === 2 ? hx - 1.0 : hy - 1.0;
    /** @param {number} u @param {number} lz */
    function projectBackPoint(u, lz) {
        const { lx, ly, lz: z } = portalDiscLocalPoint(faceIndex, hx, hy, u, lz);
        return projectPropVertexInto(sProjected, prop, px, py, lx * cos - ly * sin, lx * sin + ly * cos, z);
    }
    ctx.save();
    ctx.strokeStyle = "#0b0f19";
    ctx.lineWidth = 1.0 * lineScale;
    const offsets = [-rx * 0.5, 0, rx * 0.5];
    for (const u of offsets) {
        const pStart = projectBackPoint(u, 1.5);
        const pEnd = projectBackPoint(u, 8.0);
        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
    }
    ctx.restore();
}
/** @returns {import("./Props3D/PropRenderer.js").PropDrawRecipe} */
export function createPortalBackStripDraw() {
    return () => {};
}
/** @returns {import("./Props3D/PropRenderer.js").PropDrawRecipe} */
export function createPortalMouthStripDraw() {
    return (ctx, prop, px, py) => {
        const { powered, linkRole, selected, mouthWorldX, mouthWorldY, halfSize, height, facing, localP1, localP2, ageMs, side, faceIndex } = prop._portalStrip;
        const lineScale = getCanvasLineScale(ctx);
        const frameColors = getFrameColors(powered);
        const screenColors = getScreenColors(powered);
        const vxLocal = px - prop.x;
        const vyLocal = py - prop.y;
        const distP1 = (localP1.x - vxLocal) ** 2 + (localP1.y - vyLocal) ** 2;
        const distP2 = (localP2.x - vxLocal) ** 2 + (localP2.y - vyLocal) ** 2;
        const distScreen = vxLocal ** 2 + vyLocal ** 2;
        const drawItems = [
            { type: "pillar", id: 1, cx: prop.x + localP1.x, cy: prop.y + localP1.y, distSq: distP1 },
            { type: "pillar", id: 2, cx: prop.x + localP2.x, cy: prop.y + localP2.y, distSq: distP2 },
            { type: "screen", cx: prop.x, cy: prop.y, distSq: distScreen, halfSize: side === 0 || side === 2 ? { x: halfSize.x - 1.4, y: halfSize.y } : { x: halfSize.x, y: halfSize.y - 1.4 } },
        ];
        drawItems.sort((a, b) => b.distSq - a.distSq);
        for (const item of drawItems)
            if (item.type === "pillar") {
                const pillarProp = { x: item.cx, y: item.cy, facing: 0 };
                drawBox(ctx, pillarProp, px, py, {
                    halfSize: { x: 1.4, y: 1.4 },
                    height: 11,
                    facing: 0,
                    faceColors: frameColors.faceColors,
                    topColors: frameColors.topColors,
                    stroke: frameColors.stroke,
                    lineWidth: 1.0 * lineScale,
                });
                const capColors = getPortalMouthColors(linkRole);
                const capFill = powered ? capColors.mid : "rgba(100, 116, 139, 0.6)";
                const capStroke = powered ? capColors.center : "rgba(148, 163, 184, 0.4)";
                const capProj = projectPropVertexInto(sProjected, pillarProp, px, py, 0, 0, 11);
                ctx.save();
                ctx.fillStyle = capFill;
                ctx.strokeStyle = capStroke;
                ctx.lineWidth = 1.0 * lineScale;
                ctx.beginPath();
                ctx.arc(capProj.x, capProj.y, 1.2 * lineScale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            } else {
                const screenProp = { x: item.cx, y: item.cy, facing: 0 };
                drawBox(ctx, screenProp, px, py, {
                    halfSize: item.halfSize,
                    height: 9.5,
                    facing: 0,
                    faceColors: screenColors.faceColors,
                    topColors: screenColors.topColors,
                    stroke: screenColors.stroke,
                    lineWidth: 1.0 * lineScale,
                });
                let worldNx = 0,
                    worldNy = 0;
                if (faceIndex === 0) {
                    worldNx = 0;
                    worldNy = -1;
                } else if (faceIndex === 1) {
                    worldNx = 1;
                    worldNy = 0;
                } else if (faceIndex === 2) {
                    worldNx = 0;
                    worldNy = 1;
                } else {
                    worldNx = -1;
                    worldNy = 0;
                }
                const toViewerX = px - screenProp.x;
                const toViewerY = py - screenProp.y;
                const mouthVisible = worldNx * toViewerX + worldNy * toViewerY > 0;
                const backVisible = -worldNx * toViewerX - worldNy * toViewerY > 0;
                if (mouthVisible)
                    if (powered) drawPortalVortex(ctx, screenProp, px, py, faceIndex, item.halfSize, 9.5, 0, lineScale, linkRole, ageMs, selected);
                    else drawPortalVortexInactive(ctx, screenProp, px, py, faceIndex, item.halfSize, 9.5, 0, lineScale, selected);
                else if (backVisible) {
                    const backFaceIndex = (faceIndex + 2) % 4;
                    drawPortalBackPanel(ctx, screenProp, px, py, backFaceIndex, item.halfSize, 9.5, 0, lineScale, selected);
                }
            }
    };
}
const portalBackStripDraw = createPortalBackStripDraw();
const portalMouthStripDraw = createPortalMouthStripDraw();
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {object} edge
 * @param {number} px
 * @param {number} py
 * @param {{ selected?: boolean, ageMs?: number }} [opts]
 */
export function drawPortalEdgeCached(ctx, grid, col, row, side, edge, px, py, { selected = false, ageMs = 0 } = {}) {
    const { powered, linkRole } = resolvePortalDrawRole(grid, col, row, side, edge);
    const { mouth } = portalMouthAndBackCells(col, row, side, edge);
    gridWallEdgeEndpoints(grid, col, row, side, sEdgeP1, sEdgeP2, 0);
    const midX = (sEdgeP1.x + sEdgeP2.x) * 0.5;
    const midY = (sEdgeP1.y + sEdgeP2.y) * 0.5;
    const mouthWorld = grid.gridToWorld(mouth.col, mouth.row);
    const cellHalf = grid.cellHalfSize;
    const { halfSize, facing } = portalStripLayout(side, cellHalf);
    const localP1 = { x: sEdgeP1.x - midX, y: sEdgeP1.y - midY };
    const localP2 = { x: sEdgeP2.x - midX, y: sEdgeP2.y - midY };
    // Resolve the face index in world coordinates
    const faceIndex = resolveMouthFaceIndex({ x: midX, y: midY }, mouthWorld.x, mouthWorld.y, halfSize, facing);
    const portalProxy = {
        x: midX,
        y: midY,
        facing,
        radius: cellHalf,
        halfExtents: halfSize,
        _portalStrip: { powered, linkRole, selected, mouthWorldX: mouthWorld.x, mouthWorldY: mouthWorld.y, halfSize, height: PORTAL_STRIP_HEIGHT, facing, localP1, localP2, ageMs, side, faceIndex },
        getCustomSpriteCacheKey() {
            const animFrame = powered ? Math.floor(ageMs / 80) % 12 : 0;
            return `portal_${side}_${powered ? 1 : 0}_${linkRole}_${selected ? 1 : 0}_f${animFrame}`;
        },
    };
    drawCachedPropSprite(ctx, portalProxy, px, py, GRID_STAMP_RENDER_KEY.PortalMouthStrip, portalMouthStripDraw);
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
 * @param {{ selected?: boolean, ageMs?: number }} [opts]
 */
export function drawPortalEdgeStrip(ctx, grid, col, row, side, edge, px, py, { selected = false, ageMs = 0 } = {}) {
    drawPortalEdgeCached(ctx, grid, col, row, side, edge, px, py, { selected, ageMs });
}
