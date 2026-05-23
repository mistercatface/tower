import { Pickup } from "./Entities.js";
import { Segment, buildArcWall } from "./Wall.js";
import { Enemy } from "./Enemy.js";
import { enemyTypes, difficultyCurve } from "./Config.js";

export function spawnPickup(state, planetX, planetY, minRadius, maxRadius, type) {
    const grid = state.gridSystem;
    let spawned = false;
    let attempts = 0;
    while (!spawned && attempts < 100) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const dist = minRadius + Math.random() * (maxRadius - minRadius);
        const testX = planetX + Math.cos(angle) * dist;
        const testY = planetY + Math.sin(angle) * dist;
        const gridPos = grid.worldToGrid(testX, testY);
        if (gridPos.col >= 0 && gridPos.col < grid.cols && gridPos.row >= 0 && gridPos.row < grid.rows) {
            const idx = gridPos.row * grid.cols + gridPos.col;
            if (grid.grid[idx] !== 1) {
                const centerX = gridPos.col * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
                const centerY = gridPos.row * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;

                state.pickups.push(new Pickup(centerX, centerY, 8, type));
                spawned = true;
            }
        }
    }
}

export const WallGenerator = {
    generate(state) {
        const planetX = state.planet.x;
        const planetY = state.planet.y;

        state.walls = [];
        state.gridSystem.centerX = planetX;
        state.gridSystem.centerY = planetY;
        const patterns = ["maze", "maze2", "square", "geometric", "honeycomb", "diamond"];
        const selected = patterns[Math.floor(Math.random() * patterns.length)];
        const themeColors = [
            { r: 0, g: 188, b: 212 },
            { r: 76, g: 175, b: 80 },
            { r: 255, g: 152, b: 0 },
            { r: 156, g: 39, b: 176 },
            { r: 63, g: 81, b: 181 },
        ];
        state.wallTheme = themeColors[Math.floor(Math.random() * themeColors.length)];
        this[selected](state, planetX, planetY);

        state.gridSystem.rebuild(state.walls, planetX, planetY);

        spawnPickup(state, planetX, planetY, 250, 300, "coin");
        spawnPickup(state, planetX, planetY, 175, 200, "eyeball");
    },

    maze2(state, px, py) {
        const cellSize = state.gridSystem.cellSize;
        const pathWidth = 1;
        const wallWidth = 1;
        const step = pathWidth + wallWidth;
        const nodesX = 15;
        const nodesY = 15;
        const cols = nodesX * step + wallWidth;
        const rows = nodesY * step + wallWidth;
        const grid = new Array(cols * rows).fill(1);

        const carveNode = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth;
            grid[sy * cols + sx] = 0;
        };

        const carveH = (nx, ny) => {
            const sx = nx * step + wallWidth + pathWidth;
            const sy = ny * step + wallWidth;
            grid[sy * cols + sx] = 0;
        };

        const carveV = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth + pathWidth;
            grid[sy * cols + sx] = 0;
        };

        const visited = new Set();
        const carveMaze = (nx, ny) => {
            visited.add(`${nx},${ny}`);
            carveNode(nx, ny);

            const dirs = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ].sort(() => Math.random() - 0.5);
            for (const [dx, dy] of dirs) {
                const tx = nx + dx;
                const ty = ny + dy;
                if (tx >= 0 && tx < nodesX && ty >= 0 && ty < nodesY && !visited.has(`${tx},${ty}`)) {
                    if (dx === 1) carveH(nx, ny);
                    if (dx === -1) carveH(tx, ny);
                    if (dy === 1) carveV(nx, ny);
                    if (dy === -1) carveV(nx, ty);
                    carveMaze(tx, ty);
                }
            }
        };

        carveMaze(Math.floor(nodesX / 2), Math.floor(nodesY / 2));

        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        for (let r = -4; r <= 4; r++) {
            for (let c = -4; c <= 4; c++) {
                if (cy + r >= 0 && cy + r < rows && cx + c >= 0 && cx + c < cols) {
                    grid[(cy + r) * cols + (cx + c)] = 0;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2) {
                    grid[r * cols + c] = 0;
                }
            }
        }

        const gateSize = 3;
        for (let i = -gateSize; i <= gateSize; i++) {
            if (cy + i >= 0 && cy + i < rows) {
                grid[0 * cols + (cx + i)] = 0;
                grid[(rows - 1) * cols + (cx + i)] = 0;
            }
            if (cx + i >= 0 && cx + i < cols) {
                grid[(cy + i) * cols + 0] = 0;
                grid[(cy + i) * cols + (cols - 1)] = 0;
            }
        }

        const offsetX = px - (cols * cellSize) / 2;
        const offsetY = py - (rows * cellSize) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) {
                    state.walls.push(new Segment(offsetX + c * cellSize + cellSize / 2, offsetY + r * cellSize + cellSize / 2, 0, cellSize, 0));
                }
            }
        }
    },

    maze(state, px, py) {
        const cellSize = state.gridSystem.cellSize;
        const pathWidth = 3;
        const wallWidth = 1;
        const step = pathWidth + wallWidth;
        const nodesX = 15;
        const nodesY = 15;
        const cols = nodesX * step + wallWidth;
        const rows = nodesY * step + wallWidth;
        const grid = new Array(cols * rows).fill(1);

        const carveNode = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth;
            for (let r = 0; r < pathWidth; r++) {
                for (let c = 0; c < pathWidth; c++) {
                    grid[(sy + r) * cols + (sx + c)] = 0;
                }
            }
        };

        const carveH = (nx, ny) => {
            const sx = nx * step + wallWidth + pathWidth;
            const sy = ny * step + wallWidth;
            for (let r = 0; r < pathWidth; r++) {
                for (let c = 0; c < wallWidth; c++) {
                    grid[(sy + r) * cols + (sx + c)] = 0;
                }
            }
        };

        const carveV = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth + pathWidth;
            for (let r = 0; r < wallWidth; r++) {
                for (let c = 0; c < pathWidth; c++) {
                    grid[(sy + r) * cols + (sx + c)] = 0;
                }
            }
        };

        const visited = new Set();
        const carveMaze = (nx, ny) => {
            visited.add(`${nx},${ny}`);
            carveNode(nx, ny);

            const dirs = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ].sort(() => Math.random() - 0.5);
            for (const [dx, dy] of dirs) {
                const tx = nx + dx;
                const ty = ny + dy;
                if (tx >= 0 && tx < nodesX && ty >= 0 && ty < nodesY && !visited.has(`${tx},${ty}`)) {
                    if (dx === 1) carveH(nx, ny);
                    if (dx === -1) carveH(tx, ny);
                    if (dy === 1) carveV(nx, ny);
                    if (dy === -1) carveV(nx, ty);
                    carveMaze(tx, ty);
                }
            }
        };

        carveMaze(Math.floor(nodesX / 2), Math.floor(nodesY / 2));

        for (let i = 0; i < (nodesX * nodesY) / 4; i++) {
            const nx = Math.floor(Math.random() * (nodesX - 1));
            const ny = Math.floor(Math.random() * (nodesY - 1));
            if (Math.random() < 0.5) carveH(nx, ny);
            else carveV(nx, ny);
        }

        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        for (let r = -6; r <= 6; r++) {
            for (let c = -6; c <= 6; c++) {
                if (cy + r >= 0 && cy + r < rows && cx + c >= 0 && cx + c < cols) {
                    grid[(cy + r) * cols + (cx + c)] = 0;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2) {
                    grid[r * cols + c] = 0;
                }
            }
        }

        const gateSize = 5;
        for (let i = -gateSize; i <= gateSize; i++) {
            for (let d = 0; d < 4; d++) {
                if (cy + i >= 0 && cy + i < rows) {
                    grid[d * cols + (cx + i)] = 0;
                    grid[(rows - 1 - d) * cols + (cx + i)] = 0;
                }
            }
            for (let d = 0; d < 4; d++) {
                if (cx + i >= 0 && cx + i < cols) {
                    grid[(cy + i) * cols + d] = 0;
                    grid[(cy + i) * cols + (cols - 1 - d)] = 0;
                }
            }
        }

        const offsetX = px - (cols * cellSize) / 2;
        const offsetY = py - (rows * cellSize) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) {
                    state.walls.push(new Segment(offsetX + c * cellSize + cellSize / 2, offsetY + r * cellSize + cellSize / 2, 0, cellSize, 0));
                }
            }
        }
    },

    geometric(state, px, py) {
        const sides = 4 + Math.floor(Math.random() * 4);
        const layers = 2 + Math.floor(state.waveManager.wave / 8);
        for (let l = 0; l < layers; l++) {
            const radius = 220 + l * 100;
            const rotOffset = l % 2 === 0 ? 0 : Math.PI / sides;
            for (let i = 0; i < sides; i++) {
                const centerAngle = (i / sides) * Math.PI * 2 + rotOffset;

                const minPhysicalGap = 140;
                const gapInRadians = minPhysicalGap / radius;
                const fullSpan = (Math.PI * 2) / sides;
                const span = Math.max(fullSpan * 0.2, fullSpan - gapInRadians);

                buildArcWall(state.walls, px, py, radius, centerAngle - span / 2, centerAngle + span / 2, 14 + l * 2);
            }
        }
    },

    fortress(state, px, py) {
        const dist = 300;
        const size = 18;
        for (let i = 0; i < 4; i++) {
            const angle = i * (Math.PI / 2);
            buildArcWall(state.walls, px, py, dist, angle - 0.4, angle + 0.4, size);
            buildArcWall(state.walls, px, py, dist + 40, angle - 0.2, angle + 0.2, size);
        }
    },

    honeycomb(state, px, py) {
        const rings = 3;
        for (let r = 1; r <= rings; r++) {
            const radius = r * 150;
            const count = r * 6;
            for (let i = 0; i < count; i++) {
                if (Math.random() > 0.4) {
                    const angle = (i / count) * Math.PI * 2;
                    buildArcWall(state.walls, px, py, radius, angle - 0.1, angle + 0.1, 20);
                }
            }
        }
    },

    square(state, px, py) {
        const cellSize = state.gridSystem.cellSize;
        const cols = 61;
        const rows = 61;
        const grid = new Array(cols * rows).fill(1);

        const minLeafSize = 14;

        class Leaf {
            constructor(x, y, w, h) {
                this.x = x;
                this.y = y;
                this.w = w;
                this.h = h;
                this.leftChild = null;
                this.rightChild = null;
                this.room = null;
                this.halls = [];
            }

            split() {
                if (this.leftChild || this.rightChild) return false;

                let splitH = Math.random() > 0.5;
                if (this.w > this.h && this.w / this.h >= 1.25) splitH = false;
                else if (this.h > this.w && this.h / this.w >= 1.25) splitH = true;

                const max = (splitH ? this.h : this.w) - minLeafSize;
                if (max <= minLeafSize) return false;

                const split = Math.floor(Math.random() * (max - minLeafSize + 1)) + minLeafSize;

                if (splitH) {
                    this.leftChild = new Leaf(this.x, this.y, this.w, split);
                    this.rightChild = new Leaf(this.x, this.y + split, this.w, this.h - split);
                } else {
                    this.leftChild = new Leaf(this.x, this.y, split, this.h);
                    this.rightChild = new Leaf(this.x + split, this.y, this.w - split, this.h);
                }

                return true;
            }

            createRooms() {
                if (this.leftChild || this.rightChild) {
                    if (this.leftChild) this.leftChild.createRooms();
                    if (this.rightChild) this.rightChild.createRooms();
                    if (this.leftChild && this.rightChild) {
                        this.createHall(this.leftChild.getRoom(), this.rightChild.getRoom());
                    }
                } else {
                    const roomW = Math.floor(Math.random() * (this.w - 6)) + 5;
                    const roomH = Math.floor(Math.random() * (this.h - 6)) + 5;
                    const roomX = Math.floor(Math.random() * (this.w - roomW - 2)) + 1;
                    const roomY = Math.floor(Math.random() * (this.h - roomH - 2)) + 1;
                    this.room = { x: this.x + roomX, y: this.y + roomY, w: roomW, h: roomH };
                }
            }

            getRoom() {
                if (this.room) return this.room;
                let lRoom = null;
                let rRoom = null;
                if (this.leftChild) lRoom = this.leftChild.getRoom();
                if (this.rightChild) rRoom = this.rightChild.getRoom();
                if (!lRoom && !rRoom) return null;
                if (!rRoom) return lRoom;
                if (!lRoom) return rRoom;
                return Math.random() > 0.5 ? lRoom : rRoom;
            }

            createHall(l, r) {
                const pathW = 4;
                const point1 = { x: Math.floor(l.x + l.w / 2), y: Math.floor(l.y + l.h / 2) };
                const point2 = { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };

                const w = point2.x - point1.x;
                const h = point2.y - point1.y;

                if (w < 0) {
                    if (h < 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else if (h > 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else {
                        this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                    }
                } else if (w > 0) {
                    if (h < 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else if (h > 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else {
                        this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                    }
                } else {
                    if (h < 0) {
                        this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    } else if (h > 0) {
                        this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                }
            }
        }

        const root = new Leaf(0, 0, cols, rows);
        const leaves = [root];

        let didSplit = true;
        while (didSplit) {
            didSplit = false;
            for (let i = 0; i < leaves.length; i++) {
                if (leaves[i].leftChild === null && leaves[i].rightChild === null) {
                    if (leaves[i].w > 30 || leaves[i].h > 30 || Math.random() > 0.25) {
                        if (leaves[i].split()) {
                            leaves.push(leaves[i].leftChild);
                            leaves.push(leaves[i].rightChild);
                            didSplit = true;
                        }
                    }
                }
            }
        }

        root.createRooms();

        const drawRoom = (r) => {
            for (let y = r.y; y < r.y + r.h; y++) {
                for (let x = r.x; x < r.x + r.w; x++) {
                    if (y >= 0 && y < rows && x >= 0 && x < cols) {
                        grid[y * cols + x] = 0;
                    }
                }
            }
        };

        const drawHalls = (leaf) => {
            if (leaf.room) drawRoom(leaf.room);
            if (leaf.halls.length > 0) {
                for (const hall of leaf.halls) {
                    drawRoom(hall);
                }
            }
            if (leaf.leftChild) drawHalls(leaf.leftChild);
            if (leaf.rightChild) drawHalls(leaf.rightChild);
        };

        drawHalls(root);

        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        for (let r = -6; r <= 6; r++) {
            for (let c = -6; c <= 6; c++) {
                if (cy + r >= 0 && cy + r < rows && cx + c >= 0 && cx + c < cols) {
                    grid[(cy + r) * cols + (cx + c)] = 0;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2) {
                    grid[r * cols + c] = 0;
                }
            }
        }

        const gateSize = 5;
        for (let i = -gateSize; i <= gateSize; i++) {
            for (let d = 0; d < 4; d++) {
                if (cy + i >= 0 && cy + i < rows) {
                    grid[d * cols + (cx + i)] = 0;
                    grid[(rows - 1 - d) * cols + (cx + i)] = 0;
                }
            }
            for (let d = 0; d < 4; d++) {
                if (cx + i >= 0 && cx + i < cols) {
                    grid[(cy + i) * cols + d] = 0;
                    grid[(cy + i) * cols + (cols - 1 - d)] = 0;
                }
            }
        }

        const offsetX = px - (cols * cellSize) / 2;
        const offsetY = py - (rows * cellSize) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) {
                    state.walls.push(new Segment(offsetX + c * cellSize + cellSize / 2, offsetY + r * cellSize + cellSize / 2, 0, cellSize, 0));
                }
            }
        }
    },

    diamond(state, px, py) {
        const wallSize = 16;
        const radii = [200, 350, 500];

        for (const r of radii) {
            const dist = Math.hypot(r, r);
            const steps = Math.floor(dist / (wallSize * 1.1));

            const gap1 = 0.1 + Math.random() * 0.6;
            const gap2 = 0.1 + Math.random() * 0.6;
            const gap3 = 0.1 + Math.random() * 0.6;
            const gap4 = 0.1 + Math.random() * 0.6;
            const gapSize = 0.2;

            for (let i = 0; i <= steps; i++) {
                const t = i / steps;

                if (!(t > gap1 && t < gap1 + gapSize)) {
                    const x1 = px + t * r;
                    const y1 = py - r + t * r;
                    state.walls.push(new Segment(x1, y1, Math.PI / 4, wallSize));
                }

                if (!(t > gap2 && t < gap2 + gapSize)) {
                    const x2 = px + r - t * r;
                    const y2 = py + t * r;
                    state.walls.push(new Segment(x2, y2, -Math.PI / 4, wallSize));
                }

                if (!(t > gap3 && t < gap3 + gapSize)) {
                    const x3 = px - t * r;
                    const y3 = py + r - t * r;
                    state.walls.push(new Segment(x3, y3, Math.PI / 4, wallSize));
                }

                if (!(t > gap4 && t < gap4 + gapSize)) {
                    const x4 = px - r + t * r;
                    const y4 = py - t * r;
                    state.walls.push(new Segment(x4, y4, -Math.PI / 4, wallSize));
                }
            }
        }
    },
};