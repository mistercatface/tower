const FLOW_DECODE_X = new Float32Array([-0.707, 0, 0.707, -1, 0, 1, -0.707, 0, 0.707]);
const FLOW_DECODE_Y = new Float32Array([-0.707, -1, -0.707, 0, 0, 0, 0.707, 1, 0.707]);
export function decodeFlowFieldCell(byte) {
    if (byte === 255) return null;
    const vx = FLOW_DECODE_X[byte];
    const vy = FLOW_DECODE_Y[byte];
    const len = Math.hypot(vx, vy);
    if (len <= 0) return null;
    return { x: vx / len, y: vy / len };
}
export function sampleFlowDirectionInto(out, x, y, flowField, frame) {
    if (!flowField) return null;
    const { cellSize, cols, rows, centerX, centerY, offsetX, offsetY } = frame;
    const halfCell = cellSize / 2;
    const gx = (x - (centerX - offsetX + halfCell)) / cellSize;
    const gy = (y - (centerY - offsetY + halfCell)) / cellSize;
    const col0 = Math.floor(gx);
    const row0 = Math.floor(gy);
    const col1 = col0 + 1;
    const row1 = row0 + 1;
    const tx = gx - col0;
    const ty = gy - row0;
    const c0_valid = col0 >= 0 && col0 < cols;
    const c1_valid = col1 >= 0 && col1 < cols;
    const r0_valid = row0 >= 0 && row0 < rows;
    const r1_valid = row1 >= 0 && row1 < rows;
    let flowX = 0;
    let flowY = 0;
    let totalWeight = 0;
    if (c0_valid && r0_valid) {
        const idx = row0 * cols + col0;
        const val = flowField[idx];
        if (val !== 255) {
            const w = (1 - tx) * (1 - ty);
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (c1_valid && r0_valid) {
        const idx = row0 * cols + col1;
        const val = flowField[idx];
        if (val !== 255) {
            const w = tx * (1 - ty);
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (c0_valid && r1_valid) {
        const idx = row1 * cols + col0;
        const val = flowField[idx];
        if (val !== 255) {
            const w = (1 - tx) * ty;
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (c1_valid && r1_valid) {
        const idx = row1 * cols + col1;
        const val = flowField[idx];
        if (val !== 255) {
            const w = tx * ty;
            flowX += FLOW_DECODE_X[val] * w;
            flowY += FLOW_DECODE_Y[val] * w;
            totalWeight += w;
        }
    }
    if (totalWeight <= 0) return null;
    const len = Math.sqrt(flowX * flowX + flowY * flowY);
    if (len <= 0) return null;
    out.x = flowX / len;
    out.y = flowY / len;
    return out;
}
export function sampleFlowDirection(x, y, flowField, frame) {
    return sampleFlowDirectionInto({ x: 0, y: 0 }, x, y, flowField, frame);
}
