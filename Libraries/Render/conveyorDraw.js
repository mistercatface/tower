import { rotateXY, transformPoint2DInto } from "../Math/Poly2D.js";
import { drawBox } from "./Props3D/SolidDraw.js";
import { projectPropVertexScalarsInto } from "./Props3D/propMesh.js";
import { getCanvasLineScale } from "./common/viewportUtils.js";
import { traceClosedFlatPolygon } from "../Canvas/CanvasPath.js";
const sScratchQuad = new Float32Array(8);
const sScratchChevron = new Float32Array(12);
const sTemp = new Float32Array(2);
const CONVEYOR_BELT_HEIGHT = 0;
/** @returns {import("../Canvas/QuantizedSpriteCache.js").PropDrawRecipe} */
export function createConveyorDraw(options = {}) {
    const { turnDirection = null, chevronColors: chevronColorsOverride } = options;
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
    return (ctx, prop, viewport) => {
        const subProp = (x, y, facing) => ({ x, y, facing });
        const hx = prop.halfExtents?.x ?? 8;
        const hy = prop.halfExtents?.y ?? 8;
        const lineScale = getCanvasLineScale(ctx);
        if (!turnDirection) {
            const angle = prop.facing ?? 0;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            // Draw full-tile belt bed
            const beltProp = subProp(prop.x, prop.y, angle);
            drawBox(ctx, beltProp, viewport, {
                halfSize: { x: hx, y: hy },
                height: CONVEYOR_BELT_HEIGHT,
                facing: angle,
                faceColors: beltColors,
                topColors: beltTopColors,
                stroke: beltStroke,
                lineWidth: 1.0 * lineScale,
            });
            function projectLocalFlat(out8, offset, lx, ly, lz) {
                const r = rotateXY(lx, ly, cos, sin);
                projectPropVertexScalarsInto(out8, offset, prop, viewport, r.x, r.y, lz);
            }
            ctx.save();
            ctx.beginPath();
            projectLocalFlat(sScratchQuad, 0, -hx, -hy, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 2, hx, -hy, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 4, hx, hy, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 6, -hx, hy, CONVEYOR_BELT_HEIGHT);
            traceClosedFlatPolygon(ctx, sScratchQuad, 4);
            ctx.clip();
            const speed = 20;
            const spacing = 8;
            const timeSec = (prop.ageMs ?? 0) / 1000;
            const offset = (timeSec * speed) % spacing;
            ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
            ctx.lineWidth = 1.0 * lineScale;
            const numSlats = Math.ceil((hx * 2) / 4) + 2;
            for (let i = -2; i < numSlats; i++) {
                const cx = -hx + ((timeSec * speed) % 4) + i * 4;
                projectLocalFlat(sScratchQuad, 0, cx, -hy, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchQuad, 2, cx, hy, CONVEYOR_BELT_HEIGHT);
                ctx.beginPath();
                ctx.moveTo(sScratchQuad[0], sScratchQuad[1]);
                ctx.lineTo(sScratchQuad[2], sScratchQuad[3]);
                ctx.stroke();
            }
            ctx.fillStyle = chevronColors.fill;
            ctx.strokeStyle = chevronColors.stroke;
            ctx.lineWidth = 0.5 * lineScale;
            const numChevrons = Math.ceil((hx * 2) / spacing) + 2;
            for (let i = -2; i < numChevrons; i++) {
                const cx = -hx + offset + i * spacing;
                projectLocalFlat(sScratchChevron, 0, cx + 1.5, 0, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 2, cx - 1.2, 3.2, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 4, cx - 0.4, 3.2, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 6, cx + 0.8, 0, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 8, cx - 0.4, -3.2, CONVEYOR_BELT_HEIGHT);
                projectLocalFlat(sScratchChevron, 10, cx - 1.2, -3.2, CONVEYOR_BELT_HEIGHT);
                ctx.beginPath();
                traceClosedFlatPolygon(ctx, sScratchChevron, 6);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        const angle = prop.facing ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const isLeft = turnDirection === "left";
        const pivotX = 8;
        const pivotY = isLeft ? 8 : -8;
        const startAngle = Math.PI;
        const dir = isLeft ? 1 : -1;
        const beltProp = subProp(prop.x, prop.y, angle);
        drawBox(ctx, beltProp, viewport, {
            halfSize: { x: hx, y: hy },
            height: CONVEYOR_BELT_HEIGHT,
            facing: angle,
            faceColors: beltColors,
            topColors: beltTopColors,
            stroke: beltStroke,
            lineWidth: 1.0 * lineScale,
        });
        function projectLocalFlat(out8, offset, lx, ly, lz) {
            const r = rotateXY(lx, ly, cos, sin);
            projectPropVertexScalarsInto(out8, offset, prop, viewport, r.x, r.y, lz);
        }
        ctx.save();
        ctx.beginPath();
        projectLocalFlat(sScratchQuad, 0, -hx, -hy, CONVEYOR_BELT_HEIGHT);
        projectLocalFlat(sScratchQuad, 2, hx, -hy, CONVEYOR_BELT_HEIGHT);
        projectLocalFlat(sScratchQuad, 4, hx, hy, CONVEYOR_BELT_HEIGHT);
        projectLocalFlat(sScratchQuad, 6, -hx, hy, CONVEYOR_BELT_HEIGHT);
        traceClosedFlatPolygon(ctx, sScratchQuad, 4);
        ctx.clip();
        const speed = 20;
        const spacing = 8;
        const timeSec = (prop.ageMs ?? 0) / 1000;
        const totalArcLength = (Math.PI / 2) * 8;
        const offset = (timeSec * speed) % spacing;
        ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
        ctx.lineWidth = 1.0 * lineScale;
        const numSlats = Math.ceil(totalArcLength / 4) + 2;
        for (let i = -1; i < numSlats; i++) {
            const s = ((timeSec * speed) % 4) + i * 4;
            if (s < 0 || s > totalArcLength) continue;
            const A = startAngle + dir * (s / 8);
            projectLocalFlat(sScratchQuad, 0, pivotX, pivotY, CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchQuad, 2, pivotX + 25 * Math.cos(A), pivotY + 25 * Math.sin(A), CONVEYOR_BELT_HEIGHT);
            ctx.beginPath();
            ctx.moveTo(sScratchQuad[0], sScratchQuad[1]);
            ctx.lineTo(sScratchQuad[2], sScratchQuad[3]);
            ctx.stroke();
        }
        ctx.fillStyle = chevronColors.fill;
        ctx.strokeStyle = chevronColors.stroke;
        ctx.lineWidth = 0.5 * lineScale;
        const numChevrons = Math.ceil(totalArcLength / spacing) + 2;
        for (let i = -1; i < numChevrons; i++) {
            const s = offset + i * spacing;
            if (s < -2 || s > totalArcLength + 2) continue;
            const A = startAngle + dir * (s / 8);
            const tipAngle = A + dir * (1.5 / 8);
            const wingAngle = A - dir * (1.2 / 8);
            const innerAngle = A - dir * (0.4 / 8);
            const innerTipAngle = A + dir * (0.8 / 8);
            projectLocalFlat(sScratchChevron, 0, pivotX + 8 * Math.cos(tipAngle), pivotY + 8 * Math.sin(tipAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 2, pivotX + (8 - 3.2) * Math.cos(wingAngle), pivotY + (8 - 3.2) * Math.sin(wingAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 4, pivotX + (8 - 3.2) * Math.cos(innerAngle), pivotY + (8 - 3.2) * Math.sin(innerAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 6, pivotX + 8 * Math.cos(innerTipAngle), pivotY + 8 * Math.sin(innerTipAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 8, pivotX + (8 + 3.2) * Math.cos(innerAngle), pivotY + (8 + 3.2) * Math.sin(innerAngle), CONVEYOR_BELT_HEIGHT);
            projectLocalFlat(sScratchChevron, 10, pivotX + (8 + 3.2) * Math.cos(wingAngle), pivotY + (8 + 3.2) * Math.sin(wingAngle), CONVEYOR_BELT_HEIGHT);
            ctx.beginPath();
            traceClosedFlatPolygon(ctx, sScratchChevron, 6);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    };
}
