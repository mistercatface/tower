import { isFaceTowardViewer } from "./Projection3D.js";
import { propAt } from "./PropDrawContext.js";
import {
    DEFAULT_PROP_HEIGHT,
    drawExtrudedRadial,
    drawRadialBand,
    drawRadialRibs,
    drawRadialCap,
    drawFoliageBlob,
    drawExtrudedBox,
    drawBarkLines,
} from "./SolidDraw.js";

export function drawBarrel(ctx, pc) {
    const radius = pc.prop.radius || 8;
    const { facing, x, y, px, py } = pc;

    drawExtrudedRadial(ctx, pc, {
        baseRadius: radius,
        height: DEFAULT_PROP_HEIGHT,
        colors: { shadow: "#3F0000", mid: "#B71C1C", highlight: "#FF5252" },
        stroke: "#4A0E0E",
    });

    const { slice1, slice2 } = drawRadialBand(ctx, pc, {
        baseRadius: radius,
        t0: 0.35,
        t1: 0.65,
        fill: "#FFEB3B",
        stroke: "#4A0E0E",
    });

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
        const phi = facing + (i * Math.PI) / 4;
        const rivetX = slice1.centerX + Math.cos(phi) * slice1.size;
        const rivetY = slice1.centerY + Math.sin(phi) * slice1.size;
        if (!isFaceTowardViewer(rivetX, rivetY, x, y, px, py)) continue;
        const phi2 = phi + 0.25;
        ctx.beginPath();
        ctx.moveTo(rivetX, rivetY);
        ctx.lineTo(
            slice2.centerX + Math.cos(phi2) * slice2.size,
            slice2.centerY + Math.sin(phi2) * slice2.size
        );
        ctx.stroke();
    }

    drawRadialRibs(ctx, pc, {
        baseRadius: radius,
        ts: [0.25, 0.75],
        stroke: "rgba(0, 0, 0, 0.45)",
    });

    const { topX, topY, capRadius } = drawRadialCap(ctx, pc, {
        radius,
        capColors: { inner: "#455A64", mid: "#37474F", outer: "#263238" },
        stroke: "#1A0A00",
    });

    const triSize = capRadius * 0.55;
    if (triSize > 2) {
        ctx.fillStyle = "#FFEB3B";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(topX, topY - triSize * 0.7);
        ctx.lineTo(topX + triSize * 0.86, topY + triSize * 0.4);
        ctx.lineTo(topX - triSize * 0.86, topY + triSize * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.font = `bold ${Math.round(triSize * 1.1)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", topX, topY + triSize * 0.05);
    }
}

export function drawCrate(ctx, pc) {
    const halfSize = pc.prop.radius || 8;
    drawExtrudedBox(ctx, pc, {
        halfSize,
        faceColors: { shadow: "#4E342E", mid: "#8D6E63", highlight: "#A1887F" },
        topColors: { light: "#BCAAA4", mid: "#A1887F", dark: "#8D6E63" },
        stroke: "#3E2723",
        plankTs: { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" },
        topCross: { stroke: "rgba(62, 39, 35, 0.6)" },
    });
}

export function drawFireBarrel(ctx, pc) {
    const radius = pc.prop.radius || 8;
    const { facing, x, y, px, py } = pc;

    // Charred barrel body
    drawExtrudedRadial(ctx, pc, {
        baseRadius: radius,
        height: DEFAULT_PROP_HEIGHT,
        colors: { shadow: "#1F0000", mid: "#5C1D1D", highlight: "#8B2626" },
        stroke: "#2A0E0E",
    });

    const { slice1, slice2 } = drawRadialBand(ctx, pc, {
        baseRadius: radius,
        t0: 0.35,
        t1: 0.65,
        fill: "#E65100", // Charred orange band
        stroke: "#2A0E0E",
    });

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
        const phi = facing + (i * Math.PI) / 4;
        const rivetX = slice1.centerX + Math.cos(phi) * slice1.size;
        const rivetY = slice1.centerY + Math.sin(phi) * slice1.size;
        if (!isFaceTowardViewer(rivetX, rivetY, x, y, px, py)) continue;
        const phi2 = phi + 0.25;
        ctx.beginPath();
        ctx.moveTo(rivetX, rivetY);
        ctx.lineTo(
            slice2.centerX + Math.cos(phi2) * slice2.size,
            slice2.centerY + Math.sin(phi2) * slice2.size
        );
        ctx.stroke();
    }

    drawRadialRibs(ctx, pc, {
        baseRadius: radius,
        ts: [0.25, 0.75],
        stroke: "rgba(0, 0, 0, 0.6)",
    });

    const { topX, topY, capRadius } = drawRadialCap(ctx, pc, {
        radius,
        capColors: { inner: "#263238", mid: "#1a237e", outer: "#000" },
        stroke: "#0A0500",
    });

    // Dynamic fire wiggling using Date.now()
    const time = Date.now();
    const numFlames = 3;
    const colors = [
        { shadow: "#D84315", mid: "#FF8F00", highlight: "#FFE082" },
        { shadow: "#C62828", mid: "#EF6C00", highlight: "#FFB74D" },
        { shadow: "#FF3D00", mid: "#FF9100", highlight: "#FFFF00" }
    ];

    for (let i = 0; i < numFlames; i++) {
        const wiggleX = Math.sin(time * 0.007 + i * 2) * (radius * 0.25);
        const wiggleY = Math.cos(time * 0.009 + i * 1.5) * (radius * 0.15) - (DEFAULT_PROP_HEIGHT * 0.35 + i * 2);
        const flameRadius = radius * (0.6 - i * 0.1);
        const flameHeight = DEFAULT_PROP_HEIGHT + 2 + i * 3;
        const flameProj = pc.project(flameHeight);
        
        drawFoliageBlob(ctx, flameProj, {
            t: 0.95,
            radius: flameRadius,
            offsetX: wiggleX,
            offsetY: wiggleY,
            colors: colors[i],
            stroke: "rgba(255, 109, 0, 0.4)",
            lineWidth: 0.8
        });
    }
}

