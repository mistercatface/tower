let NeighborData = null;
let NeighborIndex = null;

const SquadDistMap = new Int32Array(GRID_SIZE).fill(-1);

function getSquadVector(ent, leader) {
    const lx = leader.endTile.x;
    const ly = leader.endTile.y;
    const ex = ent.endTile.x;
    const ey = ent.endTile.y;
    const SEARCH_RADIUS = 20;
    SquadDistMap.fill(-1);
    let startIdx = lx + ly * GRID_WIDTH;
    if (startIdx < 0 || startIdx >= GRID_SIZE || ObstacleGrid[startIdx] !== 0) {
        let bestStart = -1;
        let bestDistSq = Infinity;
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                const nx = lx + x;
                const ny = ly + y;
                if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
                    const idx = nx + ny * GRID_WIDTH;
                    if (ObstacleGrid[idx] === 0) {
                         const dSq = x*x + y*y;
                         if (dSq < bestDistSq) { bestDistSq = dSq; bestStart = idx; }
                    }
                }
            }
        }
        if (bestStart !== -1) startIdx = bestStart;
        else return { x: 0, y: 0, dist: Infinity };
    }
    const queue = new Int32Array(GRID_SIZE); 
    let head = 0, tail = 0;
    SquadDistMap[startIdx] = 0;
    queue[tail++] = startIdx;
    while(head < tail) {
        const idx = queue[head++];
        const d = SquadDistMap[idx];
        if (d >= SEARCH_RADIUS) continue;
        const start = NeighborIndex[idx];
        const end = NeighborIndex[idx + 1];
        for(let i = start; i < end; i++) {
            const nIdx = NeighborData[i];
            if (SquadDistMap[nIdx] === -1) {
                SquadDistMap[nIdx] = d + 1;
                queue[tail++] = nIdx;
            }
        }
    }
    const entIdx = ex + ey * GRID_WIDTH;
    const currentDist = SquadDistMap[entIdx];
    if (currentDist === 0) return { x: 0, y: 0, dist: 0 };
    if (currentDist === -1) return { x: 0, y: 0, dist: Infinity };
    let bestIdx = -1;
    let bestVal = 9999; 
    const start = NeighborIndex[entIdx];
    const end = NeighborIndex[entIdx + 1];
    for(let k = start; k < end; k++) {
        const nIdx = NeighborData[k];
        const d = SquadDistMap[nIdx];
        if (d !== -1 && d < bestVal) {
            const nx = nIdx % GRID_WIDTH;
            const ny = (nIdx / GRID_WIDTH) | 0;
            const dx = nx - ex;
            const dy = ny - ey;
            if (dx !== 0 && dy !== 0) {
                const c1 = (ex + dx) + ey * GRID_WIDTH;
                const c2 = ex + (ey + dy) * GRID_WIDTH;
                if (ObstacleGrid[c1] !== 0 || ObstacleGrid[c2] !== 0) continue;
            }
            bestVal = d; 
            bestIdx = nIdx; 
        }
    }
    if (bestIdx !== -1) {
        const nx = bestIdx % GRID_WIDTH;
        const ny = (bestIdx / GRID_WIDTH) | 0;
        let vx = (nx + 0.5) - (ent.x + 0.5); 
        let vy = (ny + 0.5) - (ent.y + 0.5);
        const len = Math.sqrt(vx*vx + vy*vy);
        if (len > 0.001) return { x: vx/len, y: vy/len, dist: currentDist };
    }
    return { x: 0, y: 0, dist: currentDist };
}

function setupNeighborArrays() {
   const allNeighbors = [];
   const indexPointers = new Int32Array(GRID_SIZE + 1);
   let totalNeighbors = 0;
   const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
   ];
   for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
         const currentIdx = getIndex(x, y);
         indexPointers[currentIdx] = totalNeighbors;
         if (ObstacleGrid[currentIdx]) {
            continue;
         }
         for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
            const nIdx = getIndex(nx, ny);
            if (ObstacleGrid[nIdx]) continue;

            if (dx !== 0 && dy !== 0) {
               if (ObstacleGrid[getIndex(x + dx, y)] &&
                  ObstacleGrid[getIndex(x, y + dy)]) {
                  continue;
               }
            }
            allNeighbors.push(nIdx);
            totalNeighbors++;
         }
      }
   }
   NeighborData = new Int32Array(allNeighbors);
   NeighborIndex = indexPointers;
   NeighborIndex[GRID_SIZE] = totalNeighbors;
}

function updateTileNeighborsInPlace(x, y) {
   const idx = getIndex(x, y);
   const start = NeighborIndex[idx];
   const end = NeighborIndex[idx + 1];
   const oldCount = end - start;
   const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
   ];
   const newNeighbors = [];
   if (ObstacleGrid[idx] === 0) {
      for (const [dx, dy] of dirs) {
         const nx = x + dx, ny = y + dy;
         if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
         const nIdx = getIndex(nx, ny);
         if (ObstacleGrid[nIdx]) continue;
         if (dx !== 0 && dy !== 0) {
            if (ObstacleGrid[getIndex(x + dx, y)] && ObstacleGrid[getIndex(x, y + dy)]) continue;
         }
         newNeighbors.push(nIdx);
      }
   }
   const newCount = newNeighbors.length;
   const delta = newCount - oldCount;
   if (delta !== 0) {
      const newSize = NeighborData.length + delta;
      const newData = new Int32Array(newSize);
      if (start > 0) newData.set(NeighborData.subarray(0, start), 0);
      newData.set(newNeighbors, start);
      if (end < NeighborData.length) {
         newData.set(NeighborData.subarray(end), start + newCount);
      }
      NeighborData = newData;
      for (let i = idx + 1; i < NeighborIndex.length; i++) {
         NeighborIndex[i] += delta;
      }
   } else if (newCount > 0) {
      NeighborData.set(newNeighbors, start);
   }
}

function updateDistances(tx, ty) {
   if(lastChaseTarget.x === tx && lastChaseTarget.y === ty) return;
   lastChaseTarget.x = tx;
   lastChaseTarget.y = ty;
   globalDists = bfsDistancesWindow(tx, ty, 64);
   ChaseVectorMap.fill(0);
   for (let i = 0; i < GRID_SIZE; i++) {
      if (ObstacleGrid[i] || globalDists[i] === -1) continue;
      let bestDist = globalDists[i];
      let bestIdx = -1;
      const start = NeighborIndex[i];
      const end = NeighborIndex[i + 1];
      for (let k = start; k < end; k++) {
         const nIdx = NeighborData[k];
         const d = globalDists[nIdx];
         if (d !== -1 && d < bestDist) {
            bestDist = d;
            bestIdx = nIdx;
         }
      }
      if (bestIdx !== -1) {
         const cx = i % GRID_WIDTH;
         const cy = (i / GRID_WIDTH) | 0;
         const nx = bestIdx % GRID_WIDTH;
         const ny = (bestIdx / GRID_WIDTH) | 0;
         let vx = nx - cx;
         let vy = ny - cy;
         const len = Math.sqrt(vx * vx + vy * vy);
         if (len > 0.001) {
             vx /= len;
             vy /= len;
         }
         
         ChaseVectorMap[i * 2] = vx;
         ChaseVectorMap[i * 2 + 1] = vy;
      }
   }
}

function refreshTileAndNeighbors(x, y) {
   updateTileNeighborsInPlace(x, y);
   const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
   ];
   for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
         updateTileNeighborsInPlace(nx, ny);
      }
   }
}

function bfsDistances(startX, startY) {
   const startIdx = getIndex(startX, startY);
   const dist = new Int32Array(GRID_SIZE).fill(-1);
   if (ObstacleGrid[startIdx]) return dist;
   const queue = new Int32Array(GRID_SIZE);
   let head = 0, tail = 0;
   dist[startIdx] = 0;
   queue[tail++] = startIdx;
   while (head < tail) {
      const idx = queue[head++];
      const cx = idx % GRID_WIDTH;
      const cy = (idx / GRID_WIDTH) | 0;
      const start = NeighborIndex[idx];
      const end = NeighborIndex[idx + 1];
      const currentDist = dist[idx];
      for (let i = start; i < end; i++) {
         const nIdx = NeighborData[i];
         if (dist[nIdx] === -1) {
            const nx = nIdx % GRID_WIDTH;
            const ny = (nIdx / GRID_WIDTH) | 0;
            if (nx !== cx && ny !== cy) {
               const adjacentXIdx = cy * GRID_WIDTH + nx;
               const adjacentYIdx = ny * GRID_WIDTH + cx;
               if (ObstacleGrid[adjacentXIdx] || ObstacleGrid[adjacentYIdx]) { continue; }
            }
            dist[nIdx] = currentDist + 1;
            queue[tail++] = nIdx;
         }
      }
   }
   return dist;
}

function bfsDistancesWindow(startX, startY, range) {
   const startIdx = getIndex(startX, startY);
   const dist = new Int32Array(GRID_SIZE).fill(-1);
   if (ObstacleGrid[startIdx]) return dist;
   const queue = new Int32Array(GRID_SIZE);
   let head = 0, tail = 0;
   dist[startIdx] = 0;
   queue[tail++] = startIdx;
   while (head < tail) {
      const idx = queue[head++];
      const currentDist = dist[idx];
      if (currentDist >= range) continue;
      const start = NeighborIndex[idx];
      const end = NeighborIndex[idx + 1];
      for (let i = start; i < end; i++) {
         const nIdx = NeighborData[i];
         if (dist[nIdx] === -1) {
            dist[nIdx] = currentDist + 1;
            queue[tail++] = nIdx;
         }
      }
   }
   return dist;
}