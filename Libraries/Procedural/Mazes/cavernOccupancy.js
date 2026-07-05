import { fillRandomGrid, runCellularAutomata } from "../../CA/index.js";
import { applyMapGenShapeMask, getMapGenBoundsStampExtent } from "../../Spatial/spatial.js";
function clearCavernOccupancyBoundaryStrip(cells, cols, rows, side, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    if (side === "south") {
        for (let strip = 0; strip < depth; strip++) {
            const lr = rows - 1 - strip;
            if (lr < 0) break;
            for (let lc = 0; lc < cols; lc++) cells[lr * cols + lc] = 0;
        }
        return;
    }
    if (side === "north")
        for (let strip = 0; strip < depth; strip++) {
            if (strip >= rows) break;
            for (let lc = 0; lc < cols; lc++) cells[strip * cols + lc] = 0;
        }
}
function carveCavernSouthVent(cells, cols, rows, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    const startRow = rows - depth;
    const seen = new Uint8Array(cols * rows);
    const queue = [];
    for (let pass = 0; pass < 32; pass++) {
        seen.fill(0);
        const components = [];
        for (let lr = 0; lr < rows; lr++)
            for (let lc = 0; lc < cols; lc++) {
                const idx = lr * cols + lc;
                if (cells[idx] !== 0 || seen[idx]) continue;
                const members = [];
                seen[idx] = 1;
                queue.length = 0;
                queue.push(idx);
                while (queue.length) {
                    const cur = queue.pop();
                    members.push(cur);
                    if (cur % cols > 0) {
                        const left = cur - 1;
                        if (cells[left] === 0 && !seen[left]) {
                            seen[left] = 1;
                            queue.push(left);
                        }
                    }
                    if ((cur + 1) % cols !== 0) {
                        const right = cur + 1;
                        if (cells[right] === 0 && !seen[right]) {
                            seen[right] = 1;
                            queue.push(right);
                        }
                    }
                    if (cur >= cols) {
                        const up = cur - cols;
                        if (cells[up] === 0 && !seen[up]) {
                            seen[up] = 1;
                            queue.push(up);
                        }
                    }
                    if (cur < cols * (rows - 1)) {
                        const down = cur + cols;
                        if (cells[down] === 0 && !seen[down]) {
                            seen[down] = 1;
                            queue.push(down);
                        }
                    }
                }
                let touchesSouth = false;
                for (let i = 0; i < members.length; i++)
                    if (members[i] >= startRow * cols) {
                        touchesSouth = true;
                        break;
                    }
                components.push({ touchesSouth, sample: members[0] });
            }
        let carved = false;
        for (let ci = 0; ci < components.length; ci++) {
            const component = components[ci];
            if (component.touchesSouth) continue;
            carved = true;
            const targetRow = (component.sample / cols) | 0;
            const targetCol = component.sample % cols;
            const exitCol = (cols / 2) | 0;
            const exitRow = rows - depth;
            for (let lc = Math.min(exitCol, targetCol); lc <= Math.max(exitCol, targetCol); lc++) cells[exitRow * cols + lc] = 0;
            for (let lr = exitRow; lr <= targetRow; lr++) cells[lr * cols + targetCol] = 0;
        }
        if (!carved) return;
    }
}
export function generateCavernOccupancy(grid, config, { openBoundarySides = null, openBoundaryRows = 1 } = {}) {
    const { originIdx, cols, rows } = getMapGenBoundsStampExtent(grid, config);
    let cells = fillRandomGrid(cols, rows, config.fillChance);
    cells = runCellularAutomata(cols, rows, cells, { iterations: config.iterations, scratch: new Uint8Array(cols * rows) });
    applyMapGenShapeMask(grid, cells, cols, rows, config, originIdx);
    if (openBoundarySides?.south) {
        clearCavernOccupancyBoundaryStrip(cells, cols, rows, "south", openBoundaryRows);
        carveCavernSouthVent(cells, cols, rows, openBoundaryRows);
    }
    if (openBoundarySides?.north) clearCavernOccupancyBoundaryStrip(cells, cols, rows, "north", openBoundaryRows);
    return { originIdx, cols, rows, cells };
}
