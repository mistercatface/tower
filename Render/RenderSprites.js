export const RenderSprites = {
    enemy: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2.5) * 2;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        offCtx.fillStyle = color;
        offCtx.fill();
        return offCanvas;
    },

    missile: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2);
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        offCtx.fillStyle = color;
        offCtx.fill();
        return offCanvas;
    },

    turret: (scale, explicitColor) => {
        const margin = Math.max(2, scale);
        const cx = Math.ceil(2 * scale + margin);
        const cy = Math.ceil(2.5 * scale + margin);
        const W = Math.ceil(cx + 4 * scale + margin);
        const H = Math.ceil(cy + 2.5 * scale + margin);

        const offCanvas = new OffscreenCanvas(W, H);
        const offCtx = offCanvas.getContext("2d");

        offCtx.save();
        offCtx.translate(cx, cy);
        offCtx.scale(scale, scale);

        const turretPoints = [
            { x: 4, y: 0 },
            { x: -2, y: 2.5 },
            { x: -2, y: -2.5 },
            { x: 4, y: 0 },
        ];

        offCtx.beginPath();
        offCtx.moveTo(turretPoints[0].x, turretPoints[0].y);
        offCtx.lineTo(turretPoints[1].x, turretPoints[1].y);
        offCtx.lineTo(turretPoints[2].x, turretPoints[2].y);
        offCtx.closePath();
        offCtx.fillStyle = explicitColor || "#4CAF50";
        offCtx.fill();

        offCtx.restore();
        return { offCanvas, cx, cy };
    },

    player: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2) + 12;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");

        // 1. Soft ambient drop shadow beneath the broccoli
        offCtx.beginPath();
        offCtx.ellipse(cx, cy + radius * 0.4, radius * 0.9, radius * 0.45, 0, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
        offCtx.fill();

        // 2. Thick stalk pointing backward (negative X direction, since positive X is forward)
        const stalkX = cx - radius * 0.35;
        const stalkY = cy;
        offCtx.beginPath();
        offCtx.ellipse(stalkX, stalkY, radius * 0.4, radius * 0.3, Math.PI / 6, 0, Math.PI * 2);
        const stalkGrad = offCtx.createLinearGradient(
            stalkX - radius * 0.3, stalkY - radius * 0.2,
            stalkX + radius * 0.3, stalkY + radius * 0.2
        );
        stalkGrad.addColorStop(0, "#C2E5A0"); // Light pale green highlight
        stalkGrad.addColorStop(0.5, "#8ECA69"); // Medium green stalk
        stalkGrad.addColorStop(1, "#548C30"); // Shadow green stalk
        offCtx.fillStyle = stalkGrad;
        offCtx.fill();
        offCtx.strokeStyle = "#385E20";
        offCtx.lineWidth = 1;
        offCtx.stroke();

        // 3. Helper to draw a volumetric floret with radial gradient shading and texture buds
        const drawFloret = (fx, fy, frad) => {
            offCtx.beginPath();
            offCtx.arc(fx, fy, frad, 0, Math.PI * 2);
            
            const grad = offCtx.createRadialGradient(
                fx - frad * 0.25, fy - frad * 0.25, frad * 0.1,
                fx, fy, frad
            );
            grad.addColorStop(0.0, "#A3E26F"); // bright lime highlight
            grad.addColorStop(0.3, "#4BAE4F"); // rich green midtone
            grad.addColorStop(0.7, "#2E7D32"); // forest green shadow
            grad.addColorStop(1.0, "#1B5E20"); // deep dark green border
            
            offCtx.fillStyle = grad;
            offCtx.fill();
            
            // Texture buds/dots
            offCtx.fillStyle = "rgba(163, 226, 111, 0.35)"; // yellow-green tiny buds
            for (let i = 0; i < 6; i++) {
                const sx = fx + (Math.sin(i * 2.3) * frad * 0.45);
                const sy = fy + (Math.cos(i * 1.7) * frad * 0.45);
                offCtx.beginPath();
                offCtx.arc(sx, sy, frad * 0.12, 0, Math.PI * 2);
                offCtx.fill();
            }
        };

        // Draw florets in overlapping layers (back to front, then center)
        // Floret 1: Top-Left (Back)
        drawFloret(cx - radius * 0.35, cy - radius * 0.35, radius * 0.5);
        // Floret 2: Bottom-Left (Back)
        drawFloret(cx - radius * 0.35, cy + radius * 0.35, radius * 0.5);
        // Floret 3: Top-Right
        drawFloret(cx + radius * 0.25, cy - radius * 0.35, radius * 0.5);
        // Floret 4: Bottom-Right
        drawFloret(cx + radius * 0.25, cy + radius * 0.35, radius * 0.5);
        // Floret 5: Front (pointing forward)
        drawFloret(cx + radius * 0.4, cy, radius * 0.55);
        // Floret 6: Center (raised on top)
        drawFloret(cx, cy, radius * 0.6);

        return { offCanvas, cx, cy };
    },

    sidekick: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2) + 12;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");

        // 1. Soft ambient drop shadow beneath the blueberry
        offCtx.beginPath();
        offCtx.ellipse(cx, cy + radius * 0.4, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(0, 0, 0, 0.4)";
        offCtx.fill();

        // 2. Main berry shape filled with 3D radial gradient
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);

        // Light source is at top-left (cx - radius * 0.3, cy - radius * 0.3)
        const grad = offCtx.createRadialGradient(
            cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
            cx, cy, radius
        );
        
        grad.addColorStop(0.0, "#A5B5F3"); // Bright waxy blue-white highlight
        grad.addColorStop(0.2, "#5C76D9"); // Powdery violet-blue
        grad.addColorStop(0.5, "#2C397F"); // Deep indigo/blueberry blue
        grad.addColorStop(0.8, "#14173D"); // Dark shadow blue
        grad.addColorStop(1.0, "#060714"); // Outer edge shadow/near black

        offCtx.fillStyle = grad;
        offCtx.fill();

        // 3. Soft velvet waxy bloom overlay for texture depth
        const bloomGrad = offCtx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
        bloomGrad.addColorStop(0, "rgba(165, 181, 243, 0)");
        bloomGrad.addColorStop(0.7, "rgba(165, 181, 243, 0.15)"); // powdery rim bloom
        bloomGrad.addColorStop(1, "rgba(165, 181, 243, 0)");
        offCtx.fillStyle = bloomGrad;
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        offCtx.fill();

        // 4. Draw the 3D calyx (star-shaped crown) offset forward along the X-axis (direction of travel)
        const ccx = cx + radius * 0.25;
        const ccy = cy;
        const numLobes = 5;
        const innerR = radius * 0.15;
        const outerR = radius * 0.28;

        // Calyx petals/lobes squashed vertically for a 3D tilt perspective
        offCtx.beginPath();
        for (let i = 0; i < numLobes; i++) {
            const a = (i * 2 * Math.PI) / numLobes;
            const nextA = ((i + 1) * 2 * Math.PI) / numLobes;
            const midA = a + Math.PI / numLobes;

            // Tip of the lobe (outer)
            const tx = ccx + Math.cos(a) * outerR;
            const ty = ccy + Math.sin(a) * outerR * 0.65;

            // Inner junction
            const jx = ccx + Math.cos(midA) * innerR;
            const jy = ccy + Math.sin(midA) * innerR * 0.65;

            if (i === 0) {
                offCtx.moveTo(tx, ty);
            } else {
                offCtx.lineTo(tx, ty);
            }
            offCtx.lineTo(jx, jy);
        }
        offCtx.closePath();
        offCtx.fillStyle = "#12142E";
        offCtx.fill();
        offCtx.strokeStyle = "#404C99";
        offCtx.lineWidth = 1.0;
        offCtx.stroke();

        // Deep dark recess/center hole inside the calyx
        offCtx.beginPath();
        offCtx.ellipse(ccx, ccy, innerR, innerR * 0.65, 0, 0, Math.PI * 2);
        offCtx.fillStyle = "#04050F";
        offCtx.fill();

        // Tiny rim highlight on the calyx edge
        offCtx.beginPath();
        offCtx.ellipse(ccx - innerR * 0.1, ccy - innerR * 0.1, innerR * 0.6, innerR * 0.4, 0, 0, Math.PI * 2);
        offCtx.strokeStyle = "rgba(165, 181, 243, 0.4)";
        offCtx.lineWidth = 0.8;
        offCtx.stroke();

        // 5. Specular highlight on the upper-left of the berry body
        offCtx.beginPath();
        offCtx.ellipse(cx - radius * 0.4, cy - radius * 0.4, radius * 0.18, radius * 0.08, Math.PI / 4, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(255, 255, 255, 0.45)";
        offCtx.fill();

        return { offCanvas, cx, cy };
    },

    tomato: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2) + 12;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");

        // 1. Soft ambient drop shadow beneath the tomato
        offCtx.beginPath();
        offCtx.ellipse(cx, cy + radius * 0.45, radius * 0.95, radius * 0.4, 0, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
        offCtx.fill();

        // 2. Main tomato body (slightly squashed sphere represented by a circle for uniform rotation)
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);

        // Light source is at top-left (cx - radius * 0.3, cy - radius * 0.3)
        const grad = offCtx.createRadialGradient(
            cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
            cx, cy, radius
        );
        
        grad.addColorStop(0.0, "#FF8A80"); // Bright tomato highlight
        grad.addColorStop(0.2, color || "#F44336"); // Vibrant tomato red
        grad.addColorStop(0.6, "#D32F2F"); // Rich red shadow
        grad.addColorStop(0.9, "#8C0000"); // Deep burgundy shadow
        grad.addColorStop(1.0, "#3A0000"); // Outer edge shadow

        offCtx.fillStyle = grad;
        offCtx.fill();

        // 3. Waxy sheen overlay for realistic texture depth
        const sheenGrad = offCtx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
        sheenGrad.addColorStop(0, "rgba(255, 138, 128, 0)");
        sheenGrad.addColorStop(0.8, "rgba(255, 138, 128, 0.12)"); // waxy rim light
        sheenGrad.addColorStop(1, "rgba(255, 138, 128, 0)");
        offCtx.fillStyle = sheenGrad;
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        offCtx.fill();

        // 4. Draw the green stem/sepals (star shape) on top of the tomato, offset slightly up-left
        const scx = cx - radius * 0.1;
        const scy = cy - radius * 0.1;
        const numLobes = 5;
        const innerR = radius * 0.12;
        const outerR = radius * 0.38;

        offCtx.beginPath();
        for (let i = 0; i < numLobes; i++) {
            const a = (i * 2 * Math.PI) / numLobes - Math.PI / 2;
            const nextA = ((i + 1) * 2 * Math.PI) / numLobes - Math.PI / 2;
            const midA = a + Math.PI / numLobes;

            // Tip of the lobe (outer leaf point)
            const tx = scx + Math.cos(a) * outerR;
            const ty = scy + Math.sin(a) * outerR;

            // Inner junction
            const jx = scx + Math.cos(midA) * innerR;
            const jy = scy + Math.sin(midA) * innerR;

            if (i === 0) {
                offCtx.moveTo(tx, ty);
            } else {
                offCtx.lineTo(tx, ty);
            }
            offCtx.lineTo(jx, jy);
        }
        offCtx.closePath();
        
        // Green gradient for the leaves
        const leafGrad = offCtx.createLinearGradient(scx - outerR, scy - outerR, scx + outerR, scy + outerR);
        leafGrad.addColorStop(0, "#81C784"); // Light green
        leafGrad.addColorStop(0.5, "#4CAF50"); // Mid green
        leafGrad.addColorStop(1, "#2E7D32"); // Dark forest green
        offCtx.fillStyle = leafGrad;
        offCtx.fill();
        offCtx.strokeStyle = "#1B5E20";
        offCtx.lineWidth = 0.8;
        offCtx.stroke();

        // 5. Draw the little stalk/stem stub in the center of the sepals
        offCtx.beginPath();
        offCtx.moveTo(scx, scy);
        offCtx.quadraticCurveTo(scx - radius * 0.1, scy - radius * 0.1, scx - radius * 0.15, scy - radius * 0.05);
        offCtx.strokeStyle = "#1B5E20";
        offCtx.lineWidth = Math.max(1.5, radius * 0.15);
        offCtx.lineCap = "round";
        offCtx.stroke();

        // 6. Specular waxy highlight on the upper-left of the tomato body
        offCtx.beginPath();
        offCtx.ellipse(cx - radius * 0.45, cy - radius * 0.45, radius * 0.15, radius * 0.07, Math.PI / 4, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(255, 255, 255, 0.55)";
        offCtx.fill();

        return { offCanvas, cx, cy };
    },

    pea: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2) + 12;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");

        // 1. Soft ambient drop shadow beneath the pea
        offCtx.beginPath();
        offCtx.ellipse(cx, cy + radius * 0.42, radius * 0.85, radius * 0.35, 0, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(0, 0, 0, 0.4)";
        offCtx.fill();

        // 2. Main pea body — slightly squashed sphere for a plump pea silhouette
        offCtx.beginPath();
        offCtx.ellipse(cx, cy, radius, radius * 0.92, 0, 0, Math.PI * 2);

        const grad = offCtx.createRadialGradient(
            cx - radius * 0.35, cy - radius * 0.35, radius * 0.08,
            cx, cy, radius
        );
        grad.addColorStop(0.0, "#C5E1A5"); // bright yellow-green highlight
        grad.addColorStop(0.25, "#7CB342"); // vibrant pea green
        grad.addColorStop(0.55, "#558B2F"); // mid green
        grad.addColorStop(0.85, "#33691E"); // deep shadow green
        grad.addColorStop(1.0, "#1B5E20"); // outer edge

        offCtx.fillStyle = grad;
        offCtx.fill();

        // 3. Waxy sheen overlay
        const sheenGrad = offCtx.createRadialGradient(cx, cy, radius * 0.45, cx, cy, radius);
        sheenGrad.addColorStop(0, "rgba(197, 225, 165, 0)");
        sheenGrad.addColorStop(0.75, "rgba(197, 225, 165, 0.1)");
        sheenGrad.addColorStop(1, "rgba(197, 225, 165, 0)");
        offCtx.fillStyle = sheenGrad;
        offCtx.beginPath();
        offCtx.ellipse(cx, cy, radius, radius * 0.92, 0, 0, Math.PI * 2);
        offCtx.fill();

        // 4. Hilum — the small scar where the pea attached to the pod
        const hcx = cx + radius * 0.3;
        const hcy = cy + radius * 0.05;
        offCtx.beginPath();
        offCtx.ellipse(hcx, hcy, radius * 0.12, radius * 0.08, Math.PI / 6, 0, Math.PI * 2);
        const hilumGrad = offCtx.createRadialGradient(
            hcx - radius * 0.04, hcy - radius * 0.03, radius * 0.02,
            hcx, hcy, radius * 0.12
        );
        hilumGrad.addColorStop(0, "#8D6E63");
        hilumGrad.addColorStop(0.5, "#5D4037");
        hilumGrad.addColorStop(1, "#3E2723");
        offCtx.fillStyle = hilumGrad;
        offCtx.fill();

        // 5. Specular highlight on the upper-left
        offCtx.beginPath();
        offCtx.ellipse(cx - radius * 0.42, cy - radius * 0.42, radius * 0.14, radius * 0.06, Math.PI / 4, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
        offCtx.fill();

        return { offCanvas, cx, cy };
    },

    pumpkin: (radius, color) => {
        const canvasSize = Math.ceil(radius * 2) + 12;
        const cx = canvasSize / 2;
        const cy = canvasSize / 2;
        const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
        const offCtx = offCanvas.getContext("2d");

        // 1. Soft ambient drop shadow beneath the pumpkin
        offCtx.beginPath();
        offCtx.ellipse(cx, cy + radius * 0.45, radius * 0.95, radius * 0.4, 0, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
        offCtx.fill();

        // 2. Main body — overhead sphere (circle for clean rotation)
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);

        const grad = offCtx.createRadialGradient(
            cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
            cx, cy, radius
        );
        grad.addColorStop(0.0, "#FFCC80");
        grad.addColorStop(0.2, color || "#FF9800");
        grad.addColorStop(0.55, "#E65100");
        grad.addColorStop(0.85, "#BF360C");
        grad.addColorStop(1.0, "#4E2600");

        offCtx.fillStyle = grad;
        offCtx.fill();

        // 3. Waxy sheen overlay
        const sheenGrad = offCtx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
        sheenGrad.addColorStop(0, "rgba(255, 204, 128, 0)");
        sheenGrad.addColorStop(0.8, "rgba(255, 204, 128, 0.12)");
        sheenGrad.addColorStop(1, "rgba(255, 204, 128, 0)");
        offCtx.fillStyle = sheenGrad;
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        offCtx.fill();

        // 4. Radial rib grooves — overhead segments from center to rim
        offCtx.save();
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        offCtx.clip();

        const numRibs = 6;
        const stemR = radius * 0.22;
        for (let i = 0; i < numRibs; i++) {
            const angle = (i / numRibs) * Math.PI * 2;
            const sx = cx + Math.cos(angle) * stemR;
            const sy = cy + Math.sin(angle) * stemR;
            const ex = cx + Math.cos(angle) * radius * 0.94;
            const ey = cy + Math.sin(angle) * radius * 0.94;

            offCtx.beginPath();
            offCtx.moveTo(sx, sy);
            offCtx.lineTo(ex, ey);
            offCtx.strokeStyle = "rgba(40, 20, 0, 0.22)";
            offCtx.lineWidth = Math.max(1, radius * 0.1);
            offCtx.lineCap = "round";
            offCtx.stroke();
        }
        offCtx.restore();

        // 5. Stem nub at sphere center (overhead view — like broccoli center floret)
        offCtx.beginPath();
        offCtx.arc(cx, cy, radius * 0.1, 0, Math.PI * 2);
        const crownGrad = offCtx.createRadialGradient(
            cx - radius * 0.03, cy - radius * 0.03, radius * 0.02,
            cx, cy, radius * 0.1
        );
        crownGrad.addColorStop(0, "#3E2723");
        crownGrad.addColorStop(1, "#5D4037");
        offCtx.fillStyle = crownGrad;
        offCtx.fill();

        offCtx.beginPath();
        offCtx.arc(cx, cy, radius * 0.22, 0, Math.PI * 2);
        const stemGrad = offCtx.createRadialGradient(
            cx - radius * 0.08, cy - radius * 0.08, radius * 0.04,
            cx, cy, radius * 0.22
        );
        stemGrad.addColorStop(0, "#A5D6A7");
        stemGrad.addColorStop(0.4, "#558B2F");
        stemGrad.addColorStop(0.75, "#33691E");
        stemGrad.addColorStop(1, "#1B5E20");
        offCtx.fillStyle = stemGrad;
        offCtx.fill();
        offCtx.strokeStyle = "#1B5E20";
        offCtx.lineWidth = 0.8;
        offCtx.stroke();

        // 6. Specular highlight on the upper-left
        offCtx.beginPath();
        offCtx.ellipse(cx - radius * 0.45, cy - radius * 0.45, radius * 0.15, radius * 0.07, Math.PI / 4, 0, Math.PI * 2);
        offCtx.fillStyle = "rgba(255, 255, 255, 0.55)";
        offCtx.fill();

        return { offCanvas, cx, cy };
    },

    wall: (size, r, g, b) => {
        const offCanvas = new OffscreenCanvas(size + 2, size + 2);
        const offCtx = offCanvas.getContext("2d");
        offCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        offCtx.fillRect(1, 1, size, size);
        return offCanvas;
    },

    floatingText: (text, style, color) => {
        const measureCanvas = new OffscreenCanvas(1, 1);
        const measureCtx = measureCanvas.getContext("2d");
        measureCtx.font = style.font;
        const metrics = measureCtx.measureText(text);

        const strokeWidth = style.strokeWidth;
        const textWidth = Math.ceil(metrics.width);
        const fontSizeMatch = style.font.match(/(\d+)px/);
        const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 12;
        const textHeight = Math.ceil(fontSize * 1.3);
        const padding = strokeWidth * 2 + 4;
        const W = textWidth + padding;
        const H = textHeight + padding;

        const offCanvas = new OffscreenCanvas(W, H);
        const offCtx = offCanvas.getContext("2d");
        offCtx.textAlign = "center";
        offCtx.textBaseline = "middle";
        offCtx.font = style.font;

        const cx = W / 2;
        const cy = H / 2;

        offCtx.strokeStyle = "rgba(0, 0, 0, 0.95)";
        offCtx.lineWidth = strokeWidth;
        offCtx.lineJoin = "round";
        offCtx.miterLimit = 2;
        offCtx.strokeText(text, cx, cy);

        offCtx.fillStyle = style.getFill(offCtx, color);
        offCtx.fillText(text, cx, cy);

        return { offCanvas, cx, cy };
    },

    reloadRing: (scale, activeSegments, segments = 5) => {
        const ringRadius = scale * 5.5;
        const padding = 2 + scale * 2;
        const size = Math.ceil((ringRadius + padding) * 2);
        const cx = size / 2;
        const cy = size / 2;

        const offCanvas = new OffscreenCanvas(size, size);
        const offCtx = offCanvas.getContext("2d");

        offCtx.save();
        offCtx.translate(cx, cy);
        for (let i = 0; i < segments; i++) {
            const angleStart = (i * 2 * Math.PI) / segments;
            const angleEnd = ((i + 1) * 2 * Math.PI) / segments - 0.2;
            offCtx.beginPath();
            offCtx.arc(0, 0, ringRadius, angleStart, angleEnd);
            offCtx.lineWidth = scale * 0.8;
            offCtx.strokeStyle = i < activeSegments ? "#FFC107" : "rgba(255, 255, 255, 0.15)";
            offCtx.stroke();
        }
        offCtx.restore();
        return { offCanvas, cx, cy };
    },

    cooldownArc: (scale, step, steps = 10) => {
        const f = 1.45;
        const maxDist = 4 * scale * f;
        const padding = 2 + scale * 2;
        const size = Math.ceil((maxDist + padding) * 2);
        const cx = size / 2;
        const cy = size / 2;

        const offCanvas = new OffscreenCanvas(size, size);
        const offCtx = offCanvas.getContext("2d");

        offCtx.save();
        offCtx.translate(cx, cy);

        const ratio = step / steps;
        
        const p0 = { x: 4 * scale * f, y: 0 };
        const p1 = { x: -2 * scale * f, y: 2.5 * scale * f };
        const p2 = { x: -2 * scale * f, y: -2.5 * scale * f };

        const points = [p0, p1, p2, p0];
        const lengths = [9.1 * scale, 7.0 * scale, 9.1 * scale];
        const totalLength = 25.2 * scale;

        let targetLength = totalLength * ratio;

        offCtx.beginPath();
        offCtx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < 3; i++) {
            const pStart = points[i];
            const pEnd = points[i + 1];
            const len = lengths[i];
            
            if (targetLength >= len) {
                offCtx.lineTo(pEnd.x, pEnd.y);
                targetLength -= len;
            } else {
                const segmentRatio = targetLength / len;
                const x = pStart.x + (pEnd.x - pStart.x) * segmentRatio;
                const y = pStart.y + (pEnd.y - pStart.y) * segmentRatio;
                offCtx.lineTo(x, y);
                break;
            }
        }

        offCtx.strokeStyle = "#FF5722";
        offCtx.lineWidth = Math.max(1.8, scale * 1.8);
        offCtx.lineJoin = "round";
        offCtx.stroke();
        
        offCtx.restore();
        return { offCanvas, cx, cy };
    },
};
