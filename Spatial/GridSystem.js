export class GridSystem {
    constructor(cellSize, width, height, radii = []) {
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.radii = radii;
        this.grid = new Array(this.cols * this.rows).fill(0);
        this.flowField = new Array(this.cols * this.rows).fill(null);
        this.playerFlowField = new Array(this.cols * this.rows).fill(null);
        this.gridsByRadius = {};
        this.flowFieldsByRadius = {};
        for (const r of this.radii) {
            this.gridsByRadius[r] = new Array(this.cols * this.rows).fill(0);
            this.flowFieldsByRadius[r] = new Array(this.cols * this.rows).fill(null);
        }
        this.offsetX = (width / 2) + (cellSize / 2);
        this.offsetY = (height / 2) + (cellSize / 2);
        this.centerX = 0;
        this.centerY = 0;
        this.segmentGrid = new Array(this.cols * this.rows).fill(null).map(() => []);
    }

    rebuild(segments, targetX, targetY) {
        this.clear();
        for (const seg of segments) {
            this.addSegment(seg);
        }
        this.buildFlowField(targetX, targetY);
    }

    buildFlowFieldTarget(px, py, targetField, gridData) {
        targetField.fill(null);
        const start = this.worldToGrid(px, py);
        if (start.col < 0 || start.col >= this.cols || start.row < 0 || start.row >= this.rows) return;

        const queue = [start];
        targetField[start.row * this.cols + start.col] = { x: 0, y: 0, dist: 0 };
        
        const dirs = [
            {c: 0, r: -1}, {c: 1, r: -1}, {c: 1, r: 0}, {c: 1, r: 1},
            {c: 0, r: 1}, {c: -1, r: 1}, {c: -1, r: 0}, {c: -1, r: -1}
        ];

        let head = 0;
        while(head < queue.length) {
            const curr = queue[head++];
            const currIdx = curr.row * this.cols + curr.col;
            const currData = targetField[currIdx];

            for (const d of dirs) {
                const nc = curr.col + d.c;
                const nr = curr.row + d.r;
                if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                    const nIdx = nr * this.cols + nc;
                    if (gridData[nIdx] === 1) continue;
                    
                    if (d.c !== 0 && d.r !== 0) {
                        const check1 = gridData[curr.row * this.cols + nc];
                        const check2 = gridData[nr * this.cols + curr.col];
                        if (check1 === 1 || check2 === 1) {
                            continue;
                        }
                    }

                    const dist = currData.dist + Math.hypot(d.c, d.r);
                    if (!targetField[nIdx] || dist < targetField[nIdx].dist) {
                        targetField[nIdx] = {
                            x: -d.c,
                            y: -d.r,
                            dist: dist
                        };
                        queue.push({col: nc, row: nr});
                    }
                }
            }
        }
    }

    buildFlowField(px, py) {
        this.buildFlowFieldTarget(px, py, this.flowField, this.grid);
        for (const r of this.radii) {
            this.buildFlowFieldTarget(px, py, this.flowFieldsByRadius[r], this.gridsByRadius[r]);
        }
    }

    buildPlayerFlowField(px, py) {
        this.buildFlowFieldTarget(px, py, this.playerFlowField, this.grid);
    }

    getNodeCenterFromField(x, y, field) {
        let { col, row } = this.worldToGrid(x, y);

        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            let flow = field[row * this.cols + col];

            if (!flow) {
                let bestDist = Infinity;
                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        const nr = row + r;
                        const nc = col + c;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            const neighborFlow = field[nr * this.cols + nc];
                            if (neighborFlow) {
                                const dist = Math.hypot(c, r);
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    flow = neighborFlow;
                                    col = nc;
                                    row = nr;
                                }
                            }
                        }
                    }
                }
            }

            if (flow && (flow.x !== 0 || flow.y !== 0)) {
                const nextCol = col + flow.x;
                const nextRow = row + flow.y;
                return {
                    x: nextCol * this.cellSize + this.centerX - this.offsetX + (this.cellSize / 2),
                    y: nextRow * this.cellSize + this.centerY - this.offsetY + (this.cellSize / 2)
                };
            }
        }
        return null;
    }

    getPlayerNextNodeCenter(x, y) {
        return this.getNodeCenterFromField(x, y, this.playerFlowField);
    }

    getNextNodeCenter(x, y) {
        return this.getNodeCenterFromField(x, y, this.flowField);
    }

    clear() {
        this.grid.fill(0);
        this.flowField.fill(null);
        this.playerFlowField.fill(null);
        for (const r of this.radii) {
            this.gridsByRadius[r].fill(0);
            this.flowFieldsByRadius[r].fill(null);
        }
        for (let i = 0; i < this.segmentGrid.length; i++) {
            this.segmentGrid[i].length = 0;
        }
    }

    worldToGrid(x, y) {
        const col = Math.floor((x - this.centerX + this.offsetX) / this.cellSize);
        const row = Math.floor((y - this.centerY + this.offsetY) / this.cellSize);
        return { col, row };
    }

    addSegment(seg) {
        if (seg.isDead) return;
        
        const halfSize = seg.size / 2;

        const processGrid = (padding, targetGrid, isMainGrid = false) => {
            const effectivePadding = padding;
            const boundingRadius = halfSize * Math.SQRT2 + effectivePadding;
            
            const minGrid = this.worldToGrid(seg.x - boundingRadius, seg.y - boundingRadius);
            const maxGrid = this.worldToGrid(seg.x + boundingRadius, seg.y + boundingRadius);
            
            const startCol = Math.max(0, minGrid.col);
            const endCol = Math.min(this.cols - 1, maxGrid.col);
            const startRow = Math.max(0, minGrid.row);
            const endRow = Math.min(this.rows - 1, maxGrid.row);
            
            const cos = Math.cos(-seg.angle);
            const sin = Math.sin(-seg.angle);
            
            for (let col = startCol; col <= endCol; col++) {
                for (let row = startRow; row <= endRow; row++) {
                    const cx = col * this.cellSize + this.centerX - this.offsetX + (this.cellSize / 2);
                    const cy = row * this.cellSize + this.centerY - this.offsetY + (this.cellSize / 2);
                    
                    const dx = cx - seg.x;
                    const dy = cy - seg.y;
                    
                    const localX = dx * cos - dy * sin;
                    const localY = dx * sin + dy * cos;
                    
                    const distX = Math.max(0, Math.abs(localX) - halfSize);
                    const distY = Math.max(0, Math.abs(localY) - halfSize);
                    
                    if ((distX * distX + distY * distY) <= effectivePadding * effectivePadding + 0.01) {
                        const idx = row * this.cols + col;
                        targetGrid[idx] = 1;
                        if (isMainGrid) {
                            if (!this.segmentGrid[idx].includes(seg)) {
                                this.segmentGrid[idx].push(seg);
                            }
                        }
                    }
                }
            }
        };

        processGrid(seg.padding, this.grid, true);
        for (const r of this.radii) {
            processGrid(r, this.gridsByRadius[r], false);
        }
    }

    getFlowAngle(x, y, defaultAngle, radius) {
        let { col, row } = this.worldToGrid(x, y);
        const targetField = (radius && this.flowFieldsByRadius[radius]) ? this.flowFieldsByRadius[radius] : this.flowField;

        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            let flow = targetField[row * this.cols + col];
            
            if (!flow) {
                let bestDist = Infinity;
                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        const nr = row + r;
                        const nc = col + c;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            const neighborFlow = targetField[nr * this.cols + nc];
                            if (neighborFlow) {
                                const dist = Math.hypot(c, r);
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    flow = neighborFlow;
                                    col = nc;
                                    row = nr;
                                }
                            }
                        }
                    }
                }
            }

            if (flow && (flow.x !== 0 || flow.y !== 0)) {
                const cx = col * this.cellSize + this.centerX - this.offsetX + (this.cellSize / 2);
                const cy = row * this.cellSize + this.centerY - this.offsetY + (this.cellSize / 2);
                
                const len = Math.hypot(flow.x, flow.y);
                const fx = flow.x / len;
                const fy = flow.y / len;
                
                const dx = x - cx;
                const dy = y - cy;
                
                const t = dx * fx + dy * fy;
                
                const projX = cx + fx * t;
                const projY = cy + fy * t;
                
                const targetX = projX + fx * 5.0;
                const targetY = projY + fy * 5.0;
                
                return Math.atan2(targetY - y, targetX - x);
            }
        }
        return defaultAngle;
    }

    getNearbySegments(entity) {
        const boundingRadius = entity.radius;
        const minGrid = this.worldToGrid(entity.x - boundingRadius, entity.y - boundingRadius);
        const maxGrid = this.worldToGrid(entity.x + boundingRadius, entity.y + boundingRadius);
        const startCol = Math.max(0, minGrid.col);
        const endCol = Math.min(this.cols - 1, maxGrid.col);
        const startRow = Math.max(0, minGrid.row);
        const endRow = Math.min(this.rows - 1, maxGrid.row);
        const nearby = [];
        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const idx = row * this.cols + col;
                const cellSegs = this.segmentGrid[idx];
                if (cellSegs) {
                    for (let i = 0; i < cellSegs.length; i++) {
                        const s = cellSegs[i];
                        if (!nearby.includes(s)) nearby.push(s);
                    }
                }
            }
        }
        return nearby;
    }
}