import { rotateXY, transformPoint2DInto } from "../Math/Poly2D.js";
import { drawBox } from "./Props3D/SolidDraw.js";
import { projectPropVertex } from "./Props3D/propMesh.js";
import { getCanvasLineScale } from "./common/viewportUtils.js";
/**
 * Returns a unique cache key part based on the conveyor's animation frame.
 * @param {object} prop
 * @returns {string}
 */
export function getConveyorSpriteCacheKey(prop) {
    const frame = Math.floor((prop.ageMs ?? 0) / 60) % 8;
    return `f${frame}`;
}
/** @returns {import("./Props3D/PropRenderer.js").PropDrawRecipe} */
export function createConveyorDraw(options = {}) {
    const { turnDirection = null, railColors: railColorsOverride, railTopColors: railTopColorsOverride, railStroke: railStrokeOverride, chevronColors: chevronColorsOverride } = options;
    const railColors = railColorsOverride ?? { shadow: "#1E293B", mid: "#334155", highlight: "#475569" };
    const railStroke = railStrokeOverride ?? "#0F172A";
    const railTopColors = railTopColorsOverride ?? { light: "#94A3B8", mid: "#64748B", dark: "#475569" };
    const chevronColors = chevronColorsOverride ?? { fill: "#0EA5E9", stroke: "#0284C7" };
    // Dark rubber colors for the moving belt bed
    const beltColors = {
        shadow: "#141414", // dark shadow
        mid: "#212121", // charcoal side
        highlight: "#373737", // slightly lighter highlights
    };
    const beltStroke = "#111111"; // dark outline
    const beltTopColors = {
        light: "#2b2b2b", // dark rubber bed
        mid: "#1e1e1e",
        dark: "#141414",
    };
    return (ctx, prop, px, py) => {
        const hx = prop.halfExtents?.x ?? 8;
        const hy = prop.halfExtents?.y ?? 8;
        const lineScale = getCanvasLineScale(ctx);
        if (!turnDirection) {
            // Straight conveyor drawing logic
            const stroke = railStroke;
            const angle = prop.facing ?? 0;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            // 1. Draw the belt bed (middle part)
            const beltHalfW = hy - 1.5; // 6.5
            const beltProp = { x: prop.x, y: prop.y, facing: angle };
            drawBox(ctx, beltProp, px, py, {
                halfSize: { x: hx, y: beltHalfW },
                height: 2,
                facing: angle,
                faceColors: beltColors,
                topColors: beltTopColors,
                stroke: beltStroke,
                lineWidth: 1.0 * lineScale,
            });
            // 2. Draw the moving belt texture/arrows on the top face (z = 2)
            function projectLocal(lx, ly, lz) {
                const r = rotateXY(lx, ly, cos, sin);
                return projectPropVertex(prop, px, py, r.x, r.y, lz);
            }
            ctx.save();
            ctx.beginPath();
            const c0 = projectLocal(-hx, -beltHalfW, 2);
            ctx.moveTo(c0.x, c0.y);
            const c1 = projectLocal(hx, -beltHalfW, 2);
            ctx.lineTo(c1.x, c1.y);
            const c2 = projectLocal(hx, beltHalfW, 2);
            ctx.lineTo(c2.x, c2.y);
            const c3 = projectLocal(-hx, beltHalfW, 2);
            ctx.lineTo(c3.x, c3.y);
            ctx.closePath();
            ctx.clip();
            const speed = 20; // speed of movement (units/sec)
            const spacing = 8; // distance between treads
            const timeSec = (prop.ageMs ?? 0) / 1000;
            const offset = (timeSec * speed) % spacing;
            // Draw dark slats/grooves (conveyor tread lines)
            ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
            ctx.lineWidth = 1.0 * lineScale;
            const numSlats = Math.ceil((hx * 2) / 4) + 2;
            for (let i = -2; i < numSlats; i++) {
                const cx = -hx + ((timeSec * speed) % 4) + i * 4;
                const pStart = projectLocal(cx, -beltHalfW, 2);
                const pEnd = projectLocal(cx, beltHalfW, 2);
                ctx.beginPath();
                ctx.moveTo(pStart.x, pStart.y);
                ctx.lineTo(pEnd.x, pEnd.y);
                ctx.stroke();
            }
            // Draw direction chevrons
            ctx.fillStyle = chevronColors.fill;
            ctx.strokeStyle = chevronColors.stroke;
            ctx.lineWidth = 0.5 * lineScale;
            const numChevrons = Math.ceil((hx * 2) / spacing) + 2;
            for (let i = -2; i < numChevrons; i++) {
                const cx = -hx + offset + i * spacing;
                const v0 = projectLocal(cx + 1.5, 0, 2); // tip
                const v1 = projectLocal(cx - 1.2, 3.2, 2); // right wing tip
                const v2 = projectLocal(cx - 0.4, 3.2, 2); // right inner
                const v3 = projectLocal(cx + 0.8, 0, 2); // inner tip
                const v4 = projectLocal(cx - 0.4, -3.2, 2); // left inner
                const v5 = projectLocal(cx - 1.2, -3.2, 2); // left wing tip
                ctx.beginPath();
                ctx.moveTo(v0.x, v0.y);
                ctx.lineTo(v1.x, v1.y);
                ctx.lineTo(v2.x, v2.y);
                ctx.lineTo(v3.x, v3.y);
                ctx.lineTo(v4.x, v4.y);
                ctx.lineTo(v5.x, v5.y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
            // 3. Draw the side rails
            const leftOffset = -7.25;
            const left = transformPoint2DInto({ x: 0, y: 0 }, prop.x, prop.y, 0, leftOffset, cos, sin);
            const leftRailProp = { x: left.x, y: left.y, facing: angle };
            drawBox(ctx, leftRailProp, px, py, {
                halfSize: { x: hx, y: 0.75 },
                height: 3.5,
                facing: angle,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: stroke,
                lineWidth: 1.0 * lineScale,
            });
            const rightOffset = 7.25;
            const right = transformPoint2DInto({ x: 0, y: 0 }, prop.x, prop.y, 0, rightOffset, cos, sin);
            const rightRailProp = { x: right.x, y: right.y, facing: angle };
            drawBox(ctx, rightRailProp, px, py, {
                halfSize: { x: hx, y: 0.75 },
                height: 3.5,
                facing: angle,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: stroke,
                lineWidth: 1.0 * lineScale,
            });
            return;
        }
        // 90-degree curved conveyor drawing logic (elbow)
        const angle = prop.facing ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const isLeft = turnDirection === "left";
        const pivotX = 8;
        const pivotY = isLeft ? 8 : -8;
        const startAngle = Math.PI;
        const endAngle = isLeft ? 1.5 * Math.PI : 0.5 * Math.PI;
        const dir = isLeft ? 1 : -1;
        const beltHalfW = hy - 1.5; // 6.5
        // Build list of subdivided boxes to draw in depth-sorted painter's order
        const offsetWorld = (lx, ly) => rotateXY(lx, ly, cos, sin);
        const drawList = [];
        if (isLeft) {
            // Belt bed segment 1 (vertical-ish relative to facing)
            const lx_b1 = 0;
            const ly_b1 = 0.75;
            const r_b1 = offsetWorld(lx_b1, ly_b1);
            const prop_b1 = { x: prop.x + r_b1.x, y: prop.y + r_b1.y, facing: angle + Math.PI / 2 };
            drawList.push({
                type: "belt",
                prop: prop_b1,
                halfSize: { x: 7.25, y: 6.5 },
                height: 2,
                faceColors: beltColors,
                topColors: beltTopColors,
                stroke: beltStroke,
                distSq: (prop_b1.x - px) ** 2 + (prop_b1.y - py) ** 2,
            });
            // Belt bed segment 2 (horizontal-ish relative to facing)
            const lx_b2 = 0.75;
            const ly_b2 = 0;
            const r_b2 = offsetWorld(lx_b2, ly_b2);
            const prop_b2 = { x: prop.x + r_b2.x, y: prop.y + r_b2.y, facing: angle };
            drawList.push({
                type: "belt",
                prop: prop_b2,
                halfSize: { x: 7.25, y: 6.5 },
                height: 2,
                faceColors: beltColors,
                topColors: beltTopColors,
                stroke: beltStroke,
                distSq: (prop_b2.x - px) ** 2 + (prop_b2.y - py) ** 2,
            });
            // Outer rail 1 (along West edge)
            const lx_r1 = -7.25;
            const ly_r1 = 0;
            const r_r1 = offsetWorld(lx_r1, ly_r1);
            const prop_r1 = { x: prop.x + r_r1.x, y: prop.y + r_r1.y, facing: angle + Math.PI / 2 };
            drawList.push({
                type: "rail",
                prop: prop_r1,
                halfSize: { x: 8, y: 0.75 },
                height: 3.5,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: railStroke,
                distSq: (prop_r1.x - px) ** 2 + (prop_r1.y - py) ** 2,
            });
            // Outer rail 2 (along North edge)
            const lx_r2 = 0;
            const ly_r2 = -7.25;
            const r_r2 = offsetWorld(lx_r2, ly_r2);
            const prop_r2 = { x: prop.x + r_r2.x, y: prop.y + r_r2.y, facing: angle };
            drawList.push({
                type: "rail",
                prop: prop_r2,
                halfSize: { x: 8, y: 0.75 },
                height: 3.5,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: railStroke,
                distSq: (prop_r2.x - px) ** 2 + (prop_r2.y - py) ** 2,
            });
            // Inner rail (bottom-right corner)
            const lx_ri = 7.25;
            const ly_ri = 7.25;
            const r_ri = offsetWorld(lx_ri, ly_ri);
            const prop_ri = { x: prop.x + r_ri.x, y: prop.y + r_ri.y, facing: angle };
            drawList.push({
                type: "rail",
                prop: prop_ri,
                halfSize: { x: 0.75, y: 0.75 },
                height: 3.5,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: railStroke,
                distSq: (prop_ri.x - px) ** 2 + (prop_ri.y - py) ** 2,
            });
        } else {
            // Belt bed segment 1 (vertical-ish relative to facing)
            const lx_b1 = 0;
            const ly_b1 = -0.75;
            const r_b1 = offsetWorld(lx_b1, ly_b1);
            const prop_b1 = { x: prop.x + r_b1.x, y: prop.y + r_b1.y, facing: angle + Math.PI / 2 };
            drawList.push({
                type: "belt",
                prop: prop_b1,
                halfSize: { x: 7.25, y: 6.5 },
                height: 2,
                faceColors: beltColors,
                topColors: beltTopColors,
                stroke: beltStroke,
                distSq: (prop_b1.x - px) ** 2 + (prop_b1.y - py) ** 2,
            });
            // Belt bed segment 2 (horizontal-ish)
            const lx_b2 = 0.75;
            const ly_b2 = 0;
            const r_b2 = offsetWorld(lx_b2, ly_b2);
            const prop_b2 = { x: prop.x + r_b2.x, y: prop.y + r_b2.y, facing: angle };
            drawList.push({
                type: "belt",
                prop: prop_b2,
                halfSize: { x: 7.25, y: 6.5 },
                height: 2,
                faceColors: beltColors,
                topColors: beltTopColors,
                stroke: beltStroke,
                distSq: (prop_b2.x - px) ** 2 + (prop_b2.y - py) ** 2,
            });
            // Outer rail 1 (along West edge)
            const lx_r1 = -7.25;
            const ly_r1 = 0;
            const r_r1 = offsetWorld(lx_r1, ly_r1);
            const prop_r1 = { x: prop.x + r_r1.x, y: prop.y + r_r1.y, facing: angle + Math.PI / 2 };
            drawList.push({
                type: "rail",
                prop: prop_r1,
                halfSize: { x: 8, y: 0.75 },
                height: 3.5,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: railStroke,
                distSq: (prop_r1.x - px) ** 2 + (prop_r1.y - py) ** 2,
            });
            // Outer rail 2 (along South edge)
            const lx_r2 = 0;
            const ly_r2 = 7.25;
            const r_r2 = offsetWorld(lx_r2, ly_r2);
            const prop_r2 = { x: prop.x + r_r2.x, y: prop.y + r_r2.y, facing: angle };
            drawList.push({
                type: "rail",
                prop: prop_r2,
                halfSize: { x: 8, y: 0.75 },
                height: 3.5,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: railStroke,
                distSq: (prop_r2.x - px) ** 2 + (prop_r2.y - py) ** 2,
            });
            // Inner rail (top-right corner)
            const lx_ri = 7.25;
            const ly_ri = -7.25;
            const r_ri = offsetWorld(lx_ri, ly_ri);
            const prop_ri = { x: prop.x + r_ri.x, y: prop.y + r_ri.y, facing: angle };
            drawList.push({
                type: "rail",
                prop: prop_ri,
                halfSize: { x: 0.75, y: 0.75 },
                height: 3.5,
                faceColors: railColors,
                topColors: railTopColors,
                stroke: railStroke,
                distSq: (prop_ri.x - px) ** 2 + (prop_ri.y - py) ** 2,
            });
        }
        // Depth sort: draw furthest boxes first
        drawList.sort((a, b) => b.distSq - a.distSq);
        for (const item of drawList)
            drawBox(ctx, item.prop, px, py, {
                halfSize: item.halfSize,
                height: item.height,
                facing: item.prop.facing,
                faceColors: item.faceColors,
                topColors: item.topColors,
                stroke: item.stroke,
                lineWidth: 1.0 * lineScale,
            });
        function projectLocal(lx, ly, lz) {
            const r = rotateXY(lx, ly, cos, sin);
            return projectPropVertex(prop, px, py, r.x, r.y, lz);
        }
        // 4. Clip and draw moving treads & chevrons on curved belt surface
        ctx.save();
        ctx.beginPath();
        const steps = 8;
        if (isLeft) {
            const pStart = projectLocal(-6.5, 8, 2);
            ctx.moveTo(pStart.x, pStart.y);
            const pCorner = projectLocal(-6.5, -6.5, 2);
            ctx.lineTo(pCorner.x, pCorner.y);
            const pExitOuter = projectLocal(8, -6.5, 2);
            ctx.lineTo(pExitOuter.x, pExitOuter.y);
            const pExitInner = projectLocal(8, 6.5, 2);
            ctx.lineTo(pExitInner.x, pExitInner.y);
            for (let i = 0; i <= steps; i++) {
                const A = 1.5 * Math.PI - (i / steps) * (0.5 * Math.PI);
                const p = projectLocal(8 + 1.5 * Math.cos(A), 8 + 1.5 * Math.sin(A), 2);
                ctx.lineTo(p.x, p.y);
            }
        } else {
            const pStart = projectLocal(-6.5, -8, 2);
            ctx.moveTo(pStart.x, pStart.y);
            const pCorner = projectLocal(-6.5, 6.5, 2);
            ctx.lineTo(pCorner.x, pCorner.y);
            const pExitOuter = projectLocal(8, 6.5, 2);
            ctx.lineTo(pExitOuter.x, pExitOuter.y);
            const pExitInner = projectLocal(8, -6.5, 2);
            ctx.lineTo(pExitInner.x, pExitInner.y);
            for (let i = 0; i <= steps; i++) {
                const A = 0.5 * Math.PI + (i / steps) * (0.5 * Math.PI);
                const p = projectLocal(8 + 1.5 * Math.cos(A), -8 + 1.5 * Math.sin(A), 2);
                ctx.lineTo(p.x, p.y);
            }
        }
        ctx.closePath();
        ctx.clip();
        // Animation movement
        const speed = 20; // units/sec
        const spacing = 8;
        const timeSec = (prop.ageMs ?? 0) / 1000;
        const totalArcLength = (Math.PI / 2) * 8; // ~12.56
        const offset = (timeSec * speed) % spacing;
        // Draw dark curved slats (treads)
        ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
        ctx.lineWidth = 1.0 * lineScale;
        const numSlats = Math.ceil(totalArcLength / 4) + 2;
        for (let i = -1; i < numSlats; i++) {
            const s = ((timeSec * speed) % 4) + i * 4;
            if (s < 0 || s > totalArcLength) continue;
            const A = startAngle + dir * (s / 8);
            const pStart = projectLocal(pivotX + 1.5 * Math.cos(A), pivotY + 1.5 * Math.sin(A), 2);
            const pEnd = projectLocal(pivotX + 25 * Math.cos(A), pivotY + 25 * Math.sin(A), 2);
            ctx.beginPath();
            ctx.moveTo(pStart.x, pStart.y);
            ctx.lineTo(pEnd.x, pEnd.y);
            ctx.stroke();
        }
        // Draw chevrons curved along path
        ctx.fillStyle = chevronColors.fill;
        ctx.strokeStyle = chevronColors.stroke;
        ctx.lineWidth = 0.5 * lineScale;
        const numChevrons = Math.ceil(totalArcLength / spacing) + 2;
        for (let i = -1; i < numChevrons; i++) {
            const s = offset + i * spacing;
            if (s < -2 || s > totalArcLength + 2) continue;
            const A = startAngle + dir * (s / 8);
            // Polar offsets for chevron vertices
            const tipAngle = A + dir * (1.5 / 8);
            const wingAngle = A - dir * (1.2 / 8);
            const innerAngle = A - dir * (0.4 / 8);
            const innerTipAngle = A + dir * (0.8 / 8);
            const v0 = projectLocal(pivotX + 8 * Math.cos(tipAngle), pivotY + 8 * Math.sin(tipAngle), 2);
            const v1 = projectLocal(pivotX + (8 - 3.2) * Math.cos(wingAngle), pivotY + (8 - 3.2) * Math.sin(wingAngle), 2);
            const v2 = projectLocal(pivotX + (8 - 3.2) * Math.cos(innerAngle), pivotY + (8 - 3.2) * Math.sin(innerAngle), 2);
            const v3 = projectLocal(pivotX + 8 * Math.cos(innerTipAngle), pivotY + 8 * Math.sin(innerTipAngle), 2);
            const v4 = projectLocal(pivotX + (8 + 3.2) * Math.cos(innerAngle), pivotY + (8 + 3.2) * Math.sin(innerAngle), 2);
            const v5 = projectLocal(pivotX + (8 + 3.2) * Math.cos(wingAngle), pivotY + (8 + 3.2) * Math.sin(wingAngle), 2);
            ctx.beginPath();
            ctx.moveTo(v0.x, v0.y);
            ctx.lineTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
            ctx.lineTo(v3.x, v3.y);
            ctx.lineTo(v4.x, v4.y);
            ctx.lineTo(v5.x, v5.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    };
}
