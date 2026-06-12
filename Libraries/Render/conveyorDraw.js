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
export function createConveyorDraw() {
    // Industrial metal palette for the conveyor side rails
    const railColors = {
        shadow: "#263238",    // shadow
        mid: "#455A64",       // cool gray/steel mid
        highlight: "#78909C", // steel highlight
    };
    const railStroke = "#1a2226"; // dark outline
    
    const railTopColors = {
        light: "#CFD8DC",     // silver top highlight
        mid: "#90A4AE",       // steel top
        dark: "#546E7A",      // darker steel top
    };

    // Dark rubber colors for the moving belt bed
    const beltColors = {
        shadow: "#141414",    // dark shadow
        mid: "#212121",       // charcoal side
        highlight: "#373737", // slightly lighter highlights
    };
    const beltStroke = "#111111"; // dark outline

    const beltTopColors = {
        light: "#2b2b2b",     // dark rubber bed
        mid: "#1e1e1e",
        dark: "#141414",
    };

    return (ctx, prop, px, py) => {
        const hx = prop.halfExtents?.x ?? prop.strategy.halfExtents?.x ?? 8;
        const hy = prop.halfExtents?.y ?? prop.strategy.halfExtents?.y ?? 8;
        const lineScale = getCanvasLineScale(ctx);
        const stroke = railStroke;

        const angle = prop.facing ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // 1. Draw the belt bed (middle part)
        // Belt is centered, width = 13 (so y goes from -6.5 to 6.5), height = 2
        const beltHalfW = hy - 1.5; // 6.5
        const beltProp = {
            x: prop.x,
            y: prop.y,
            facing: angle,
        };

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
        // Project local coordinates to screen
        function projectLocal(lx, ly, lz) {
            const rx = lx * cos - ly * sin;
            const ry = lx * sin + ly * cos;
            return projectPropVertex(prop, px, py, rx, ry, lz);
        }

        // Clip drawing of chevrons/stripes to the top face of the belt base
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

        // Animate based on prop.ageMs
        const speed = 20; // speed of movement (units/sec)
        const spacing = 8; // distance between treads
        const timeSec = (prop.ageMs ?? 0) / 1000;
        const offset = (timeSec * speed) % spacing;

        // Draw dark slats/grooves (conveyor tread lines)
        ctx.strokeStyle = "rgba(10, 10, 10, 0.4)";
        ctx.lineWidth = 1.0 * lineScale;
        const numSlats = Math.ceil((hx * 2) / 4) + 2;
        for (let i = -2; i < numSlats; i++) {
            const cx = -hx + (timeSec * speed) % 4 + i * 4;
            const pStart = projectLocal(cx, -beltHalfW, 2);
            const pEnd = projectLocal(cx, beltHalfW, 2);
            ctx.beginPath();
            ctx.moveTo(pStart.x, pStart.y);
            ctx.lineTo(pEnd.x, pEnd.y);
            ctx.stroke();
        }

        // Draw bright amber/orange direction chevrons
        ctx.fillStyle = "#FFB300"; // Factorio-like bright amber
        ctx.strokeStyle = "#FF6F00"; // Orange stroke
        ctx.lineWidth = 0.5 * lineScale;
        
        const numChevrons = Math.ceil((hx * 2) / spacing) + 2;
        for (let i = -2; i < numChevrons; i++) {
            const cx = -hx + offset + i * spacing;
            
            // Define chevron points in local space (centered at cx, pointing +x)
            const v0 = projectLocal(cx + 1.5, 0, 2);      // tip
            const v1 = projectLocal(cx - 1.2, 3.2, 2);    // right wing tip
            const v2 = projectLocal(cx - 0.4, 3.2, 2);    // right inner
            const v3 = projectLocal(cx + 0.8, 0, 2);      // inner tip
            const v4 = projectLocal(cx - 0.4, -3.2, 2);   // left inner
            const v5 = projectLocal(cx - 1.2, -3.2, 2);   // left wing tip

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
        // Left rail (offset -7.25, width 1.5, height 3.5)
        const leftOffset = -7.25;
        const leftX = prop.x + (0 * cos - leftOffset * sin);
        const leftY = prop.y + (0 * sin + leftOffset * cos);
        const leftRailProp = { x: leftX, y: leftY, facing: angle };
        
        drawBox(ctx, leftRailProp, px, py, {
            halfSize: { x: hx, y: 0.75 },
            height: 3.5,
            facing: angle,
            faceColors: railColors,
            topColors: railTopColors,
            stroke: stroke,
            lineWidth: 1.0 * lineScale,
        });

        // Right rail (offset 7.25, width 1.5, height 3.5)
        const rightOffset = 7.25;
        const rightX = prop.x + (0 * cos - rightOffset * sin);
        const rightY = prop.y + (0 * sin + rightOffset * cos);
        const rightRailProp = { x: rightX, y: rightY, facing: angle };
        
        drawBox(ctx, rightRailProp, px, py, {
            halfSize: { x: hx, y: 0.75 },
            height: 3.5,
            facing: angle,
            faceColors: railColors,
            topColors: railTopColors,
            stroke: stroke,
            lineWidth: 1.0 * lineScale,
        });
    };
}

