import { createProjector } from "../../Kinematics/core/projector.js";

function drawPixelCircle(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    const rInt = Math.ceil(r);
    const cxR = Math.round(cx);
    const cyR = Math.round(cy);
    for (let y = -rInt; y <= rInt; y++) {
        for (let x = -rInt; x <= rInt; x++) {
            if (x * x + y * y <= r * r) {
                ctx.fillRect(cxR + x, cyR + y, 1, 1);
            }
        }
    }
}

function drawPixelLine(ctx, x0, y0, x1, y1, thickness, color) {
    ctx.fillStyle = color;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const half = Math.max(0, Math.floor(thickness / 2));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = Math.round(x0 + dx * t);
        const py = Math.round(y0 + dy * t);
        for (let oy = -half; oy <= half; oy++) {
            for (let ox = -half; ox <= half; ox++) {
                ctx.fillRect(px + ox, py + oy, 1, 1);
            }
        }
    }
}

export function createSceneRenderer(config) {
    const TYPE_SPHERE = 0;
    const TYPE_CYLINDER = 1;
    const TYPE_CUSTOM = 2;

    return {
        queue: [],
        pool: [],
        poolIndex: 0,
        ctx: null,
        project: null,

        getItem() {
            if (this.poolIndex >= this.pool.length) {
                this.pool.push({});
            }
            return this.pool[this.poolIndex++];
        },

        begin(ctx, viewContext, rotation, rig) {
            this.ctx = ctx;
            this.queue.length = 0;
            this.poolIndex = 0;
            this.project = createProjector(viewContext, rotation, config, rig);
            ctx.imageSmoothingEnabled = false;
        },

        addSphere(pos, radius, palette) {
            const p = this.project(pos);
            const r = radius * p.scale;
            if (r < 0.25) return;
            const item = this.getItem();
            item.type = TYPE_SPHERE;
            item.z = p.sortZ;
            item.x = Math.round(p.x);
            item.y = Math.round(p.y);
            item.r = r;
            item.palette = palette;
            this.queue.push(item);
        },

        addCustom(z, callback) {
            const item = this.getItem();
            item.type = TYPE_CUSTOM;
            item.z = z;
            item.callback = callback;
            this.queue.push(item);
        },

        addCylinder(start, end, radius, palette, scaleWidth = 1.0) {
            const s = this.project(start);
            const e = this.project(end);
            const item = this.getItem();
            item.type = TYPE_CYLINDER;
            item.z = (s.sortZ + e.sortZ) / 2;
            item.sx = Math.round(s.x);
            item.sy = Math.round(s.y);
            item.ex = Math.round(e.x);
            item.ey = Math.round(e.y);
            const avgScale = (s.scale + e.scale) * 0.5;
            item.thickness = Math.max(1, radius * avgScale * scaleWidth * 2);
            item.palette = palette;
            this.queue.push(item);
        },

        flush() {
            this.queue.sort((a, b) => a.z - b.z);
            const ctx = this.ctx;
            for (let i = 0; i < this.queue.length; i++) {
                const item = this.queue[i];
                if (item.type === TYPE_SPHERE) {
                    drawPixelCircle(ctx, item.x, item.y, item.r, item.palette.base);
                    if (item.r > 2.5) {
                        ctx.fillStyle = item.palette.light;
                        ctx.fillRect(item.x - 1, item.y - 1, 1, 1);
                    }
                } else if (item.type === TYPE_CYLINDER) {
                    drawPixelLine(ctx, item.sx, item.sy, item.ex, item.ey, item.thickness, item.palette.base);
                } else if (item.type === TYPE_CUSTOM) {
                    item.callback(ctx);
                }
            }
            this.queue.length = 0;
        },
    };
}
