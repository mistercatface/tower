import { createSeededRng } from "../../Math/SeededRng.js";
export function bakeSnakeRailBspMaze(stampBounds, options, mapSeed) {
    const cols = stampBounds.cols;
    const rows = stampBounds.rows;
    const originCol = stampBounds.originCol;
    const originRow = stampBounds.originRow;
    const northReserve = Math.max(0, Math.round(options.northReserveRows ?? 3));
    const activeRows = Math.max(2, rows - northReserve);
    const corridorWidthMin = Math.max(1, Math.round(options.corridorWidthMin ?? 1));
    const corridorWidthMax = Math.max(corridorWidthMin, Math.round(options.corridorWidthMax ?? 2));
    const extraLinkRatio = options.extraLinkRatio ?? 0.25;
    const rng = createSeededRng((mapSeed * 16807 + 29) | 0);
    // Determine corridor width
    let W_c = corridorWidthMin === corridorWidthMax ? corridorWidthMin : corridorWidthMin + Math.floor(rng() * (corridorWidthMax - corridorWidthMin + 1));
    let numX = Math.floor(cols / W_c);
    let numY = Math.floor(activeRows / W_c);
    // Fallback if the area is too small for the selected corridor width
    if (numX < 2 || numY < 2) {
        W_c = 1;
        numX = cols;
        numY = activeRows;
    }
    // Initialize walls: all walls are closed (1)
    const verticalWalls = Array.from({ length: numX - 1 }, () => new Uint8Array(numY).fill(1));
    const horizontalWalls = Array.from({ length: numX }, () => new Uint8Array(numY - 1).fill(1));
    // Randomized DFS to carve the spanning tree
    const visited = Array.from({ length: numX }, () => new Uint8Array(numY));
    const startX = Math.floor(rng() * numX);
    const startY = Math.floor(rng() * numY);
    visited[startX][startY] = 1;
    const stack = [[startX, startY]];
    while (stack.length > 0) {
        const [cx, cy] = stack[stack.length - 1];
        // Find unvisited neighbors
        const neighbors = [];
        if (cy > 0 && !visited[cx][cy - 1]) neighbors.push([cx, cy - 1, "N"]);
        if (cx < numX - 1 && !visited[cx + 1][cy]) neighbors.push([cx + 1, cy, "E"]);
        if (cy < numY - 1 && !visited[cx][cy + 1]) neighbors.push([cx, cy + 1, "S"]);
        if (cx > 0 && !visited[cx - 1][cy]) neighbors.push([cx - 1, cy, "W"]);
        if (neighbors.length > 0) {
            // Pick a random neighbor
            const [nx, ny, dir] = neighbors[Math.floor(rng() * neighbors.length)];
            visited[nx][ny] = 1;
            // Carve path (open the wall)
            if (dir === "N") horizontalWalls[cx][cy - 1] = 0;
            else if (dir === "E") verticalWalls[cx][cy] = 0;
            else if (dir === "S") horizontalWalls[cx][cy] = 0;
            else if (dir === "W") verticalWalls[nx][ny] = 0;
            stack.push([nx, ny]);
        } else stack.pop();
    }
    // Merge some random 2x2 blocks of logical cells to make small room chambers (adds variety)
    const roomCount = Math.floor(numX * numY * 0.05);
    for (let i = 0; i < roomCount; i++) {
        const rx = Math.floor(rng() * (numX - 1));
        const ry = Math.floor(rng() * (numY - 1));
        verticalWalls[rx][ry] = 0;
        verticalWalls[rx][ry + 1] = 0;
        horizontalWalls[rx][ry] = 0;
        horizontalWalls[rx + 1][ry] = 0;
    }
    // Open extra walls randomly based on extraLinkRatio to make the maze loopy (avoiding dead ends)
    for (let lx = 0; lx < numX - 1; lx++) for (let ly = 0; ly < numY; ly++) if (verticalWalls[lx][ly] === 1 && rng() < extraLinkRatio) verticalWalls[lx][ly] = 0;
    for (let lx = 0; lx < numX; lx++) for (let ly = 0; ly < numY - 1; ly++) if (horizontalWalls[lx][ly] === 1 && rng() < extraLinkRatio) horizontalWalls[lx][ly] = 0;
    const heightLevel = options.railWallHeightLevel ?? 1;
    const thicknessLevel = options.railWallThicknessLevel ?? 1;
    const walls = [];
    // Helper to push a wall
    const pushWall = (c, r, side) => {
        walls.push({ col: c + originCol, row: r + originRow, side, heightLevel, thicknessLevel });
    };
    // Convert logical walls to grid-level rail walls
    for (let r = northReserve; r < rows; r++) {
        const ly = Math.min(numY - 1, Math.floor((r - northReserve) / W_c));
        for (let c = 0; c < cols; c++) {
            const lx = Math.min(numX - 1, Math.floor(c / W_c));
            // 1. North Edge (side 0)
            if (r === northReserve) {
                // North boundary of the active maze area - open to northern reserve rows
            } else {
                const ly_up = Math.min(numY - 1, Math.floor((r - 1 - northReserve) / W_c));
                if (ly_up < ly && horizontalWalls[lx][ly_up] === 1) pushWall(c, r, 0);
            }
            // 2. West Edge (side 3)
            if (c === 0)
                pushWall(c, r, 3); // Outer West boundary
            else {
                const lx_left = Math.min(numX - 1, Math.floor((c - 1) / W_c));
                if (lx_left < lx && verticalWalls[lx_left][ly] === 1) pushWall(c, r, 3);
            }
            // 3. East Edge (side 1)
            if (c === cols - 1) pushWall(c, r, 1); // Outer East boundary
            // 4. South Edge (side 2)
            if (r === rows - 1) pushWall(c, r, 2); // Outer South boundary
        }
    }
    return walls;
}
