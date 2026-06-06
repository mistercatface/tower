import { drawLoFiLongAxisCylinder } from "../../Render/Props3D/lofiTippedCylinder.js";
/** @param {object} [visuals] */
export function createCueStickDraw(visuals = {}) {
    const stroke = visuals.stroke ?? null;
    const lineWidth = visuals.lineWidth ?? 0.65;
    const hx = visuals.hx ?? 72;
    const hy = visuals.hy ?? 1.15;
    const height = visuals.height ?? 2.3;
    return (ctx, prop, px, py) => {
        const cs = prop.cueStick ?? {};
        const finalHx = cs.hx ?? hx;
        const finalHy = cs.hy ?? hy;
        const finalHeight = cs.height ?? height;
        const facing = prop.facing ?? 0;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const segmentsList = [
            {
                start: -finalHx,
                end: -finalHx * 0.45,
                rScale: 1.5,
                colors: { side: "#2D1B18", sideAlt: "#1C0F0D", top: "#2D1B18", bottom: "#110A08" }, // Butt sleeve
            },
            {
                start: -finalHx * 0.45,
                end: -finalHx * 0.1,
                rScale: 1.25,
                colors: { side: "#242424", sideAlt: "#181818", top: "#242424", bottom: "#181818" }, // Grip wrap
            },
            {
                start: -finalHx * 0.1,
                end: finalHx - 3.5,
                rScale: 0.9,
                colors: { side: "#F5F2EB", sideAlt: "#E8E4DB", top: "#F5F2EB", bottom: "#E8E4DB" }, // Maple shaft
            },
            {
                start: finalHx - 3.5,
                end: finalHx,
                rScale: 0.65,
                colors: { side: "#FFFFFA", sideAlt: "#ECECE7", top: "#4B909D", bottom: "#ECECE7" }, // Ferrule + Blue tip
            },
        ];
        for (const seg of segmentsList) {
            const shx = (seg.end - seg.start) * 0.5;
            const slx = (seg.start + seg.end) * 0.5;
            const tempProp = { ...prop, x: prop.x + cos * slx, y: prop.y + sin * slx };
            drawLoFiLongAxisCylinder(ctx, tempProp, px, py, { hx: shx, hy: finalHy * seg.rScale, height: finalHeight, segments: visuals.segments ?? 28, colors: seg.colors, stroke, lineWidth });
        }
    };
}
