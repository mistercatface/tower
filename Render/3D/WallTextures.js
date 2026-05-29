import { wallTextureSettings } from "../../Config/Config.js";

const textureCache = new Map();

function themeKey(theme) {
    return `${theme.r},${theme.g},${theme.b},${theme.patternType || "brick"}`;
}

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function shadeRgb(theme, amount) {
    return `rgb(${clampByte(theme.r * amount)}, ${clampByte(theme.g * amount)}, ${clampByte(theme.b * amount)})`;
}

function buildProceduralTexture(theme, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const patternType = theme.patternType || "brick";

    if (patternType === "brick") {
        const mortar = shadeRgb(theme, 0.35);
        const brickLight = shadeRgb(theme, 1.08);
        const brickMid = shadeRgb(theme, 0.82);
        const brickDark = shadeRgb(theme, 0.62);
        const grout = "rgba(0, 0, 0, 0.22)";

        ctx.fillStyle = mortar;
        ctx.fillRect(0, 0, size, size);

        const mortarX = Math.max(2, Math.round(size * 0.06));
        const mortarY = Math.max(2, Math.round(size * 0.08));
        const rowH = Math.floor((size - mortarY) / 3);
        const cols = 2;

        for (let row = 0; row < 3; row++) {
            const y = row * (rowH + mortarY);
            const offset = row % 2 === 0 ? 0 : Math.round(size / (cols * 2));
            const brickW = Math.floor((size - mortarX * (cols + 1)) / cols);

            for (let col = 0; col < cols; col++) {
                const x = mortarX + col * (brickW + mortarX) + offset;
                if (x + brickW > size) continue;

                const tone = (row + col) % 3;
                ctx.fillStyle = tone === 0 ? brickLight : tone === 1 ? brickMid : brickDark;
                ctx.fillRect(x, y, brickW, rowH);

                ctx.strokeStyle = grout;
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, brickW - 1, rowH - 1);
            }
        }
    } else if (patternType === "tech-grid") {
        ctx.fillStyle = shadeRgb(theme, 0.2);
        ctx.fillRect(0, 0, size, size);

        // Outer border / grout
        ctx.strokeStyle = shadeRgb(theme, 0.45);
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, size, size);

        // Sub-panels (e.g. 2x2 grid of tech panels)
        const margin = 4;
        const panelSize = (size - margin * 3) / 2;
        ctx.lineWidth = 1;

        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 2; c++) {
                const px = margin + c * (panelSize + margin);
                const py = margin + r * (panelSize + margin);
                
                // Shadowed plate look
                ctx.fillStyle = shadeRgb(theme, 0.65);
                ctx.fillRect(px, py, panelSize, panelSize);
                
                // Neon bevel highlight
                ctx.strokeStyle = shadeRgb(theme, 1.3);
                ctx.strokeRect(px + 0.5, py + 0.5, panelSize - 1, panelSize - 1);

                // Glowing inner dot / LED at panel center
                ctx.fillStyle = shadeRgb(theme, 1.8);
                ctx.fillRect(px + panelSize / 2 - 1, py + panelSize / 2 - 1, 2, 2);

                // Rivets/screws at corners
                ctx.fillStyle = shadeRgb(theme, 0.35);
                const roff = 2;
                ctx.fillRect(px + roff, py + roff, 1.5, 1.5);
                ctx.fillRect(px + panelSize - roff - 1.5, py + roff, 1.5, 1.5);
                ctx.fillRect(px + roff, py + panelSize - roff - 1.5, 1.5, 1.5);
                ctx.fillRect(px + panelSize - roff - 1.5, py + panelSize - roff - 1.5, 1.5, 1.5);
            }
        }
    } else if (patternType === "stripes") {
        ctx.fillStyle = shadeRgb(theme, 0.2);
        ctx.fillRect(0, 0, size, size);

        const numStripes = 4;
        const stripeH = size / numStripes;

        for (let i = 0; i < numStripes; i++) {
            const y = i * stripeH;
            
            // Premium metallic/glassy gradient
            const grad = ctx.createLinearGradient(0, y, 0, y + stripeH);
            grad.addColorStop(0, shadeRgb(theme, 1.25));
            grad.addColorStop(0.2, shadeRgb(theme, 0.9));
            grad.addColorStop(0.7, shadeRgb(theme, 0.55));
            grad.addColorStop(1, shadeRgb(theme, 0.25));

            ctx.fillStyle = grad;
            ctx.fillRect(1, y + 1, size - 2, stripeH - 2);

            // Highlighting line at top of each stripe
            ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
            ctx.fillRect(1, y + 1, size - 2, 1.5);
        }
    } else if (patternType === "stone-block") {
        ctx.fillStyle = shadeRgb(theme, 0.3); // mortar
        ctx.fillRect(0, 0, size, size);

        const rowHeights = [20, 24, 20];
        const rowCols = [
            [32, 32],
            [20, 24, 20],
            [28, 36]
        ];

        let currentY = 0;
        for (let r = 0; r < rowHeights.length; r++) {
            const rh = rowHeights[r];
            const cols = rowCols[r];
            let currentX = 0;
            for (let c = 0; c < cols.length; c++) {
                const cw = cols[c];

                // Select slightly distinct tones
                const tone = ((r * 2) + c) % 3;
                const stoneColor = tone === 0 
                    ? shadeRgb(theme, 1.05) 
                    : tone === 1 
                        ? shadeRgb(theme, 0.8) 
                        : shadeRgb(theme, 0.6);

                ctx.fillStyle = stoneColor;
                ctx.fillRect(currentX + 1, currentY + 1, cw - 2, rh - 2);

                // Draw bevel stroke
                ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
                ctx.lineWidth = 1;
                ctx.strokeRect(currentX + 1.5, currentY + 1.5, cw - 3, rh - 3);

                // Random stony speckle noise
                ctx.fillStyle = shadeRgb(theme, 0.45);
                // Seeded-like noise based on stone coordinates so it's consistent
                const numSpecks = 4;
                for (let np = 0; np < numSpecks; np++) {
                    const nx = currentX + 3 + ((currentX * 17 + np * 29) % (cw - 6));
                    const ny = currentY + 3 + ((currentY * 31 + np * 13) % (rh - 6));
                    ctx.fillRect(nx, ny, 1.5, 1.5);
                }

                currentX += cw;
            }
            currentY += rh;
        }
    } else if (patternType === "cyber-core") {
        ctx.fillStyle = shadeRgb(theme, 0.15);
        ctx.fillRect(0, 0, size, size);

        // Outer frame border
        ctx.strokeStyle = shadeRgb(theme, 0.95);
        ctx.lineWidth = 2.5;
        ctx.strokeRect(3, 3, size - 6, size - 6);

        // Second inner frame
        ctx.strokeStyle = shadeRgb(theme, 0.45);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(12, 12, size - 24, size - 24);

        // Diagonal circuit lines in the corners of the panel
        ctx.strokeStyle = shadeRgb(theme, 0.8);
        ctx.lineWidth = 1.5;
        
        // Top-Left corner link
        ctx.beginPath();
        ctx.moveTo(3, 3);
        ctx.lineTo(12, 12);
        ctx.stroke();

        // Top-Right corner link
        ctx.beginPath();
        ctx.moveTo(size - 3, 3);
        ctx.lineTo(size - 12, 12);
        ctx.stroke();

        // Bottom-Left corner link
        ctx.beginPath();
        ctx.moveTo(3, size - 3);
        ctx.lineTo(12, size - 12);
        ctx.stroke();

        // Bottom-Right corner link
        ctx.beginPath();
        ctx.moveTo(size - 3, size - 3);
        ctx.lineTo(size - 12, size - 12);
        ctx.stroke();

        // Central glowing radial power core
        const glowGrad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, 14);
        glowGrad.addColorStop(0, shadeRgb(theme, 1.85));
        glowGrad.addColorStop(0.4, shadeRgb(theme, 1.1));
        glowGrad.addColorStop(0.85, shadeRgb(theme, 0.45));
        glowGrad.addColorStop(1, "transparent");
        
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 14, 0, Math.PI * 2);
        ctx.fill();

        // Core ring
        ctx.strokeStyle = shadeRgb(theme, 1.6);
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
        ctx.stroke();
    } else if (patternType === "diamond-mesh") {
        ctx.fillStyle = shadeRgb(theme, 0.22);
        ctx.fillRect(0, 0, size, size);

        // Darker horizontal backing lines
        ctx.strokeStyle = shadeRgb(theme, 0.35);
        ctx.lineWidth = 1;
        for (let y = 8; y < size; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
        }

        // Glowing diagonal mesh lines
        ctx.strokeStyle = shadeRgb(theme, 1.15);
        ctx.lineWidth = 2.0;

        const steps = 4;
        const spacing = size / steps;

        for (let i = -steps; i < steps * 2; i++) {
            // Diagonal from top-left to bottom-right
            ctx.beginPath();
            ctx.moveTo(0, i * spacing);
            ctx.lineTo(size, size + i * spacing);
            ctx.stroke();

            // Diagonal from bottom-left to top-right
            ctx.beginPath();
            ctx.moveTo(0, size - i * spacing);
            ctx.lineTo(size, -i * spacing);
            ctx.stroke();
        }

        // Add metal node intersections
        ctx.fillStyle = shadeRgb(theme, 1.55);
        for (let x = 0; x <= size; x += spacing) {
            for (let y = 0; y <= size; y += spacing) {
                ctx.fillRect(x - 2.0, y - 2.0, 4.0, 4.0);
            }
            for (let y = spacing / 2; y <= size; y += spacing) {
                ctx.fillRect(x + spacing / 2 - 2.0, y - 2.0, 4.0, 4.0);
            }
        }
    }

    return canvas;
}

export function getWallTextureCanvas(theme) {
    const key = themeKey(theme);
    if (!textureCache.has(key)) {
        textureCache.set(
            key,
            buildProceduralTexture(theme, wallTextureSettings.textureSize)
        );
    }
    return textureCache.get(key);
}

export async function loadWallTextureFromImage(url, theme) {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    textureCache.set(themeKey(theme), canvas);
    return canvas;
}

export function clearWallTextureCache() {
    textureCache.clear();
}
