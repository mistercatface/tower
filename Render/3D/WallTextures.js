import { wallTextureSettings } from "../../Config/Config.js";
import { SpriteCache } from "../SpriteCache.js";

const wallTextureCache = new SpriteCache();
const floorTextureCache = new SpriteCache();

function themeKey(theme) {
    return `${theme.r},${theme.g},${theme.b},${theme.patternType || "brick"}`;
}

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function shadeRgb(theme, amount) {
    return `rgb(${clampByte(theme.r * amount)}, ${clampByte(theme.g * amount)}, ${clampByte(theme.b * amount)})`;
}

function shadeRgba(theme, amount, alpha) {
    return `rgba(${clampByte(theme.r * amount)}, ${clampByte(theme.g * amount)}, ${clampByte(theme.b * amount)}, ${alpha})`;
}

function hashNoise(x, y) {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v);
}

function applyTextureSoftening(ctx, size) {
    const imageData = ctx.getImageData(0, 0, size, size);
    const d = imageData.data;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const n = (hashNoise(x, y) - 0.5) * 8;
            d[i] = clampByte(d[i] + n);
            d[i + 1] = clampByte(d[i + 1] + n);
            d[i + 2] = clampByte(d[i + 2] + n);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

/* =========================================================================
   WALL PROCEDURAL PATTERNS
   ========================================================================= */

function drawWallBrick(ctx, size, theme) {
    ctx.fillStyle = shadeRgb(theme, 0.15); // Mortar backing
    ctx.fillRect(0, 0, size, size);

    const rows = 4;
    const rowH = size / rows;
    const cols = 2;
    const colW = size / cols;

    ctx.lineWidth = 1;

    for (let r = 0; r < rows; r++) {
        const y = r * rowH;
        const offset = (r % 2 === 0) ? 0 : colW / 2;

        for (let c = -1; c <= cols; c++) {
            const x = c * colW + offset;
            const bx = x + 1;
            const by = y + 1;
            const bw = colW - 2;
            const bh = rowH - 2;

            const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
            grad.addColorStop(0, shadeRgb(theme, 0.75));
            grad.addColorStop(1, shadeRgb(theme, 0.45));
            ctx.fillStyle = grad;
            ctx.fillRect(bx, by, bw, bh);

            // Highlights
            ctx.strokeStyle = shadeRgba(theme, 1.4, 0.7);
            ctx.beginPath();
            ctx.moveTo(bx + 0.5, by + bh - 1);
            ctx.lineTo(bx + 0.5, by + 0.5);
            ctx.lineTo(bx + bw - 1, by + 0.5);
            ctx.stroke();

            // Shadows
            ctx.strokeStyle = shadeRgba(theme, 0.2, 0.7);
            ctx.beginPath();
            ctx.moveTo(bx + 1, by + bh - 0.5);
            ctx.lineTo(bx + bw - 0.5, by + bh - 0.5);
            ctx.lineTo(bx + bw - 0.5, by + 1);
            ctx.stroke();
        }
    }
}

function drawWallTechGrid(ctx, size, theme) {
    ctx.fillStyle = shadeRgb(theme, 0.12);
    ctx.fillRect(0, 0, size, size);

    const panelSize = size / 2;
    ctx.lineWidth = 1;

    for (let py = 0; py < 2; py++) {
        for (let px = 0; px < 2; px++) {
            const x = px * panelSize;
            const y = py * panelSize;

            ctx.fillStyle = shadeRgb(theme, 0.22);
            ctx.fillRect(x + 1, y + 1, panelSize - 2, panelSize - 2);

            ctx.strokeStyle = shadeRgba(theme, 1.3, 0.5);
            ctx.beginPath();
            ctx.moveTo(x + 1.5, y + panelSize - 2);
            ctx.lineTo(x + 1.5, y + 1.5);
            ctx.lineTo(x + panelSize - 2, y + 1.5);
            ctx.stroke();

            ctx.strokeStyle = shadeRgba(theme, 0.05, 0.6);
            ctx.beginPath();
            ctx.moveTo(x + 2, y + panelSize - 1.5);
            ctx.lineTo(x + panelSize - 1.5, y + panelSize - 1.5);
            ctx.lineTo(x + panelSize - 1.5, y + 2);
            ctx.stroke();
        }
    }

    ctx.strokeStyle = shadeRgb(theme, 1.5);
    ctx.lineWidth = 1.5;
    ctx.shadowColor = shadeRgb(theme, 1.5);
    ctx.shadowBlur = 4;

    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.lineTo(32, 20);
    ctx.lineTo(44, 32);
    ctx.lineTo(44, 60);

    ctx.moveTo(4, 32);
    ctx.lineTo(20, 32);
    ctx.lineTo(32, 44);
    ctx.lineTo(32, 60);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    const nodes = [
        { x: 32, y: 4 },
        { x: 44, y: 60 },
        { x: 4, y: 32 },
        { x: 32, y: 60 }
    ];
    for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
}

function drawWallStripes(ctx, size, theme) {
    ctx.fillStyle = shadeRgb(theme, 0.1);
    ctx.fillRect(0, 0, size, size);

    const slats = 4;
    const slatW = size / slats;

    for (let i = 0; i < slats; i++) {
        const x = i * slatW;

        const grad = ctx.createLinearGradient(x, 0, x + slatW, 0);
        grad.addColorStop(0, shadeRgb(theme, 0.4));
        grad.addColorStop(0.3, shadeRgb(theme, 0.8));
        grad.addColorStop(0.7, shadeRgb(theme, 0.5));
        grad.addColorStop(1, shadeRgb(theme, 0.2));
        ctx.fillStyle = grad;
        ctx.fillRect(x + 1, 0, slatW - 2, size);

        ctx.strokeStyle = shadeRgba(theme, 1.4, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1.5, 0);
        ctx.lineTo(x + 1.5, size);
        ctx.stroke();

        ctx.strokeStyle = shadeRgba(theme, 0.05, 0.7);
        ctx.beginPath();
        ctx.moveTo(x + slatW - 1.5, 0);
        ctx.lineTo(x + slatW - 1.5, size);
        ctx.stroke();

        ctx.strokeStyle = shadeRgba(theme, 0.15, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let y = 8; y < size; y += 8) {
            ctx.moveTo(x + 2, y);
            ctx.lineTo(x + slatW - 2, y);
        }
        ctx.stroke();
    }
}

function drawWallStoneBlock(ctx, size, theme) {
    ctx.fillStyle = shadeRgb(theme, 0.1);
    ctx.fillRect(0, 0, size, size);

    const stones = [
        {
            pts: [{ x: 1, y: 1 }, { x: 38, y: 1 }, { x: 30, y: 30 }, { x: 1, y: 30 }],
            shade: 0.6
        },
        {
            pts: [{ x: 40, y: 1 }, { x: 63, y: 1 }, { x: 63, y: 40 }, { x: 42, y: 40 }, { x: 32, y: 30 }],
            shade: 0.5
        },
        {
            pts: [{ x: 1, y: 32 }, { x: 30, y: 32 }, { x: 40, y: 42 }, { x: 40, y: 63 }, { x: 1, y: 63 }],
            shade: 0.55
        },
        {
            pts: [{ x: 42, y: 42 }, { x: 63, y: 42 }, { x: 63, y: 63 }, { x: 42, y: 63 }],
            shade: 0.45
        }
    ];

    ctx.lineWidth = 1;

    for (const stone of stones) {
        ctx.beginPath();
        ctx.moveTo(stone.pts[0].x, stone.pts[0].y);
        for (let i = 1; i < stone.pts.length; i++) {
            ctx.lineTo(stone.pts[i].x, stone.pts[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = shadeRgb(theme, stone.shade);
        ctx.fill();

        // Highlight
        ctx.strokeStyle = shadeRgba(theme, 1.3, 0.55);
        ctx.beginPath();
        ctx.moveTo(stone.pts[stone.pts.length - 1].x, stone.pts[stone.pts.length - 1].y);
        for (let i = 0; i < stone.pts.length; i++) {
            const p = stone.pts[i];
            const prev = stone.pts[(i - 1 + stone.pts.length) % stone.pts.length];
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            if (dx >= 0 && dy <= 0.1 || dy < 0 && dx >= -0.1) {
                ctx.lineTo(p.x, p.y);
            } else {
                ctx.moveTo(p.x, p.y);
            }
        }
        ctx.stroke();

        // Shadow
        ctx.strokeStyle = shadeRgba(theme, 0.05, 0.7);
        ctx.beginPath();
        ctx.moveTo(stone.pts[stone.pts.length - 1].x, stone.pts[stone.pts.length - 1].y);
        for (let i = 0; i < stone.pts.length; i++) {
            const p = stone.pts[i];
            const prev = stone.pts[(i - 1 + stone.pts.length) % stone.pts.length];
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            if (dx < 0 && dy > -0.1 || dy > 0 && dx <= 0.1) {
                ctx.lineTo(p.x, p.y);
            } else {
                ctx.moveTo(p.x, p.y);
            }
        }
        ctx.stroke();

        // Crack details
        ctx.strokeStyle = shadeRgba(theme, 0.1, 0.4);
        ctx.beginPath();
        if (stone.shade === 0.6) {
            ctx.moveTo(10, 10);
            ctx.lineTo(16, 8);
            ctx.lineTo(18, 14);
        } else if (stone.shade === 0.5) {
            ctx.moveTo(48, 15);
            ctx.lineTo(52, 22);
        }
        ctx.stroke();
    }
}

function drawWallCyberCore(ctx, size, theme) {
    ctx.fillStyle = "#090a0f";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = shadeRgba(theme, 0.25, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 8; x < size; x += 16) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
    }
    for (let y = 8; y < size; y += 16) {
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
    }
    ctx.stroke();

    const cx = size / 2;
    const cy = cx;

    ctx.shadowColor = shadeRgb(theme, 1.6);
    ctx.shadowBlur = 5;

    ctx.strokeStyle = shadeRgb(theme, 1.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = shadeRgba(theme, 1.1, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.stroke();

    const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
    radial.addColorStop(0, "#ffffff");
    radial.addColorStop(0.4, shadeRgb(theme, 1.8));
    radial.addColorStop(1, "transparent");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = shadeRgb(theme, 1.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy);
    ctx.lineTo(0, cy);
    ctx.moveTo(cx + 24, cy);
    ctx.lineTo(size, cy);
    ctx.moveTo(cx, cy - 24);
    ctx.lineTo(cx, 0);
    ctx.moveTo(cx, cy + 24);
    ctx.lineTo(cx, size);
    ctx.stroke();

    ctx.shadowBlur = 0;
}

function drawWallDiamondMesh(ctx, size, theme) {
    ctx.fillStyle = "#0c0d12";
    ctx.fillRect(0, 0, size, size);

    ctx.lineWidth = 2.5;

    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 16) {
        ctx.moveTo(i + 1, -1);
        ctx.lineTo(i + size + 1, size - 1);
        ctx.moveTo(i + 1, size + 1);
        ctx.lineTo(i + size + 1, -1);
    }
    ctx.stroke();

    ctx.strokeStyle = shadeRgb(theme, 0.55);
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 16) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
    }
    ctx.stroke();

    ctx.strokeStyle = shadeRgb(theme, 0.65);
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 16) {
        ctx.moveTo(i, size);
        ctx.lineTo(i + size, 0);
    }
    ctx.stroke();

    ctx.strokeStyle = shadeRgba(theme, 1.4, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 16) {
        ctx.moveTo(i - 0.5, -0.5);
        ctx.lineTo(i + size - 0.5, size - 0.5);
    }
    ctx.stroke();

    ctx.fillStyle = shadeRgb(theme, 1.1);
    for (let x = 0; x <= size; x += 8) {
        for (let y = 0; y <= size; y += 8) {
            if ((x + y) % 16 === 0) {
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

/* =========================================================================
   FLOOR PROCEDURAL PATTERNS
   ========================================================================= */

function drawFloorBrick(ctx, size, theme) {
    ctx.fillStyle = shadeRgb(theme, 0.12);
    ctx.fillRect(0, 0, size, size);

    const tileSize = size / 2;

    for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
            const x = tx * tileSize;
            const y = ty * tileSize;
            const bx = x + 1;
            const by = y + 1;
            const bw = tileSize - 2;
            const bh = tileSize - 2;

            const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
            grad.addColorStop(0, shadeRgb(theme, 0.45));
            grad.addColorStop(1, shadeRgb(theme, 0.28));
            ctx.fillStyle = grad;
            ctx.fillRect(bx, by, bw, bh);

            ctx.strokeStyle = shadeRgba(theme, 1.2, 0.55);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx, by + bh - 1);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + bw - 1, by);
            ctx.stroke();

            ctx.strokeStyle = shadeRgba(theme, 0.05, 0.6);
            ctx.beginPath();
            ctx.moveTo(bx + 1, by + bh - 0.5);
            ctx.lineTo(bx + bw - 0.5, by + bh - 0.5);
            ctx.lineTo(bx + bw - 0.5, by + 1);
            ctx.stroke();
        }
    }
}

function drawFloorTechGrid(ctx, size, theme) {
    ctx.fillStyle = "#0c0d11";
    ctx.fillRect(0, 0, size, size);

    const margin = 2;
    const px = margin;
    const py = margin;
    const pw = size - margin * 2;
    const ph = size - margin * 2;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, shadeRgb(theme, 0.22));
    grad.addColorStop(1, shadeRgb(theme, 0.12));
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, ph);

    ctx.strokeStyle = shadeRgba(theme, 0.4, 0.4);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

    ctx.fillStyle = shadeRgb(theme, 0.45);
    ctx.strokeStyle = shadeRgba(theme, 0.1, 0.8);
    ctx.lineWidth = 0.5;
    const rivets = [
        { x: px + 4, y: py + 4 },
        { x: px + pw - 4, y: py + 4 },
        { x: px + 4, y: py + ph - 4 },
        { x: px + pw - 4, y: py + ph - 4 }
    ];
    for (const r of rivets) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r.x - 1.2, r.y - 1.2);
        ctx.lineTo(r.x + 1.2, r.y + 1.2);
        ctx.stroke();
    }

    ctx.strokeStyle = shadeRgb(theme, 1.3);
    ctx.lineWidth = 1;
    ctx.shadowColor = shadeRgb(theme, 1.4);
    ctx.shadowBlur = 3;

    ctx.beginPath();
    ctx.moveTo(px + 6, py + ph / 2);
    ctx.lineTo(px + 22, py + ph / 2);
    ctx.lineTo(px + 32, py + ph / 2 - 10);
    ctx.lineTo(px + pw - 6, py + ph / 2 - 10);
    ctx.stroke();

    ctx.shadowBlur = 0;
}

function drawFloorStripes(ctx, size, theme) {
    ctx.fillStyle = shadeRgb(theme, 0.12);
    ctx.fillRect(0, 0, size, size);

    const slats = 4;
    const slatH = size / slats;

    for (let i = 0; i < slats; i++) {
        const y = i * slatH;

        const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
        grad.addColorStop(0, shadeRgb(theme, 0.45));
        grad.addColorStop(0.2, shadeRgb(theme, 0.6));
        grad.addColorStop(0.8, shadeRgb(theme, 0.4));
        grad.addColorStop(1, shadeRgb(theme, 0.22));
        ctx.fillStyle = grad;
        ctx.fillRect(0, y + 1, size, slatH - 2);

        ctx.strokeStyle = shadeRgba(theme, 1.2, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 1.5);
        ctx.lineTo(size, y + 1.5);
        ctx.stroke();

        ctx.strokeStyle = shadeRgba(theme, 0.05, 0.6);
        ctx.beginPath();
        ctx.moveTo(0, y + slatH - 1.5);
        ctx.lineTo(size, y + slatH - 1.5);
        ctx.stroke();

        ctx.strokeStyle = shadeRgba(theme, 1.3, 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 6; x < size; x += 12) {
            ctx.moveTo(x, y + 4);
            ctx.lineTo(x + 4, y + 8);
            ctx.moveTo(x + 3, y + 4);
            ctx.lineTo(x + 7, y + 8);
        }
        ctx.stroke();
    }
}

function drawFloorStoneBlock(ctx, size, theme) {
    ctx.fillStyle = "#12100e";
    ctx.fillRect(0, 0, size, size);

    const cobbles = [
        { cx: 16, cy: 16, rx: 14, ry: 12, rot: 0.2, shade: 0.45 },
        { cx: 48, cy: 14, rx: 13, ry: 11, rot: -0.1, shade: 0.38 },
        { cx: 14, cy: 46, rx: 12, ry: 13, rot: -0.3, shade: 0.42 },
        { cx: 46, cy: 48, rx: 14, ry: 12, rot: 0.4, shade: 0.35 }
    ];

    for (const c of cobbles) {
        ctx.save();
        ctx.translate(c.cx, c.cy);
        ctx.rotate(c.rot);

        ctx.beginPath();
        ctx.ellipse(0, 0, c.rx, c.ry, 0, 0, Math.PI * 2);

        const grad = ctx.createRadialGradient(-c.rx / 3, -c.ry / 3, 1, 0, 0, c.rx);
        grad.addColorStop(0, shadeRgb(theme, c.shade * 1.3));
        grad.addColorStop(1, shadeRgb(theme, c.shade * 0.7));
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = shadeRgba(theme, 1.3, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, c.rx - 1, c.ry - 1, 0, Math.PI, Math.PI * 1.8);
        ctx.stroke();

        ctx.strokeStyle = shadeRgba(theme, 0.05, 0.6);
        ctx.beginPath();
        ctx.ellipse(0, 0, c.rx - 1, c.ry - 1, 0, 0, Math.PI * 0.8);
        ctx.stroke();

        ctx.restore();
    }
}

function drawFloorCyberCore(ctx, size, theme) {
    ctx.fillStyle = "#07080a";
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = cx;

    ctx.shadowColor = shadeRgb(theme, 1.5);
    ctx.shadowBlur = 4;

    ctx.strokeStyle = shadeRgb(theme, 1.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 17, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#101115";
    ctx.fill();

    ctx.strokeStyle = shadeRgb(theme, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = cy - 16; y <= cy + 16; y += 4) {
        ctx.moveTo(cx - 16, y);
        ctx.lineTo(cx + 16, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = shadeRgb(theme, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(0, cy);
    ctx.moveTo(cx + 18, cy);
    ctx.lineTo(size, cy);
    ctx.moveTo(cx, cy - 18);
    ctx.lineTo(cx, 0);
    ctx.moveTo(cx, cy + 18);
    ctx.lineTo(cx, size);
    ctx.stroke();
}

function drawFloorDiamondMesh(ctx, size, theme) {
    ctx.fillStyle = "#050608";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = shadeRgb(theme, 0.22);
    ctx.fillRect(0, 0, size, 4);
    ctx.fillRect(0, size - 4, size, 4);
    ctx.fillRect(0, 0, 4, size);
    ctx.fillRect(size - 4, 0, 4, size);

    ctx.strokeStyle = shadeRgba(theme, 1.2, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, size - 1);
    ctx.lineTo(1, 1);
    ctx.lineTo(size - 1, 1);
    ctx.stroke();

    ctx.strokeStyle = shadeRgba(theme, 0.05, 0.6);
    ctx.beginPath();
    ctx.moveTo(2, size - 2);
    ctx.lineTo(size - 2, size - 2);
    ctx.lineTo(size - 2, 2);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(4, 4, size - 8, size - 8);
    ctx.clip();

    ctx.lineWidth = 1.5;

    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 8) {
        ctx.moveTo(i + 1, -1);
        ctx.lineTo(i + size + 1, size - 1);
        ctx.moveTo(i + 1, size + 1);
        ctx.lineTo(i + size + 1, -1);
    }
    ctx.stroke();

    ctx.strokeStyle = shadeRgb(theme, 0.48);
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 8) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
    }
    ctx.stroke();

    ctx.strokeStyle = shadeRgb(theme, 0.58);
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 8) {
        ctx.moveTo(i, size);
        ctx.lineTo(i + size, 0);
    }
    ctx.stroke();

    ctx.strokeStyle = shadeRgba(theme, 1.3, 0.5);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += 8) {
        ctx.moveTo(i - 0.5, -0.5);
        ctx.lineTo(i + size - 0.5, size - 0.5);
    }
    ctx.stroke();

    ctx.restore();
}

/* =========================================================================
   CORE BUILD PROCEDURES
   ========================================================================= */

function buildProceduralWallTexture(theme, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const patternType = theme.patternType || "brick";

    switch (patternType) {
        case "brick":
            drawWallBrick(ctx, size, theme);
            break;
        case "tech-grid":
            drawWallTechGrid(ctx, size, theme);
            break;
        case "stripes":
            drawWallStripes(ctx, size, theme);
            break;
        case "stone-block":
            drawWallStoneBlock(ctx, size, theme);
            break;
        case "cyber-core":
            drawWallCyberCore(ctx, size, theme);
            break;
        case "diamond-mesh":
            drawWallDiamondMesh(ctx, size, theme);
            break;
    }

    applyTextureSoftening(ctx, size);
    return canvas;
}

function buildProceduralFloorTexture(theme, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const patternType = theme.patternType || "brick";

    switch (patternType) {
        case "brick":
            drawFloorBrick(ctx, size, theme);
            break;
        case "tech-grid":
            drawFloorTechGrid(ctx, size, theme);
            break;
        case "stripes":
            drawFloorStripes(ctx, size, theme);
            break;
        case "stone-block":
            drawFloorStoneBlock(ctx, size, theme);
            break;
        case "cyber-core":
            drawFloorCyberCore(ctx, size, theme);
            break;
        case "diamond-mesh":
            drawFloorDiamondMesh(ctx, size, theme);
            break;
    }

    applyTextureSoftening(ctx, size);
    return canvas;
}

/* =========================================================================
   PUBLIC API
   ========================================================================= */

export function getWallTextureCanvas(theme) {
    const key = themeKey(theme);
    return wallTextureCache.get(key, () => {
        return buildProceduralWallTexture(theme, wallTextureSettings.textureSize);
    });
}

export function getFloorTextureCanvas(theme) {
    const key = themeKey(theme);
    return floorTextureCache.get(key, () => {
        return buildProceduralFloorTexture(theme, wallTextureSettings.textureSize);
    });
}

export function clearWallTextureCache() {
    wallTextureCache.clear();
    floorTextureCache.clear();
}
