export class Navigator {
    static getSteeringAngle(x, y, gridSystem, targetField) {
        const halfCell = gridSystem.cellSize / 2;
        const gx = (x - (gridSystem.centerX - gridSystem.offsetX + halfCell)) / gridSystem.cellSize;
        const gy = (y - (gridSystem.centerY - gridSystem.offsetY + halfCell)) / gridSystem.cellSize;
        const col0 = Math.floor(gx);
        const row0 = Math.floor(gy);
        const col1 = col0 + 1;
        const row1 = row0 + 1;
        const tx = gx - col0;
        const ty = gy - row0;
        const getFlowVec = (c, r) => {
            if (c < 0 || c >= gridSystem.cols || r < 0 || r >= gridSystem.rows) return null;
            const f = targetField[r * gridSystem.cols + c];
            if (!f) return null;
            const len = Math.hypot(f.x, f.y);
            return len > 0 ? { x: f.x / len, y: f.y / len } : null;
        };
        const v00 = getFlowVec(col0, row0);
        const v10 = getFlowVec(col1, row0);
        const v01 = getFlowVec(col0, row1);
        const v11 = getFlowVec(col1, row1);
        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;
        let flowX = 0;
        let flowY = 0;
        let totalWeight = 0;
        if (v00) { flowX += v00.x * w00; flowY += v00.y * w00; totalWeight += w00; }
        if (v10) { flowX += v10.x * w10; flowY += v10.y * w10; totalWeight += w10; }
        if (v01) { flowX += v01.x * w01; flowY += v01.y * w01; totalWeight += w01; }
        if (v11) { flowX += v11.x * w11; flowY += v11.y * w11; totalWeight += w11; }
        if (totalWeight > 0) return Math.atan2(flowY, flowX);
        return null;
    }
}