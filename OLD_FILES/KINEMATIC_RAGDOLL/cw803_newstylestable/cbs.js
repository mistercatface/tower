const REGION_TILES = new Map();

const MAX_EXPANSIONS = 3000;
const HEURISTIC_WEIGHT = 1.5;
const TIME_HORIZON = 48;

const EXECUTION_STEPS = 1;
const MIN_REGION_DIST = 5;

const COOP_PATHS = new Map();
const PATH_STEP_COUNTER = new Map();
const HPA_GRAPH = new Map();
const AGENT_ABSTRACT_PATH = new Map();

const CLEARANCE = new Int32Array(GRID_SIZE);
const REGION_ID_MAP = new Int32Array(GRID_SIZE).fill(-1);

const SIPP_VISITED = new Map();
const SIPP_CAME_FROM = new Map();
const TEMP_TIMES = new Int32Array(2048);

function getManhattanDist(idxA, idxB) {
   const ax = idxA % GRID_WIDTH, ay = (idxA / GRID_WIDTH) | 0;
   const bx = idxB % GRID_WIDTH, by = (idxB / GRID_WIDTH) | 0;
   return Math.abs(ax - bx) + Math.abs(ay - by);
}

function getIndex(x, y) { return x + (y * GRID_WIDTH); }

function isWalkable(idx) {
   if (idx < 0 || idx >= GRID_SIZE) return false;
   return ObstacleGrid[idx] === 0;
}

function fillNodeCoords(node) {
    node.x = (node.index % GRID_WIDTH) + 0.5;
    node.y = Math.floor(node.index / GRID_WIDTH) + 0.5;
    return node;
}

class MinCheap {
   constructor(capacity = 262144) {
      this.size = 0;
      this.f = new Float32Array(capacity);
      this.g = new Int32Array(capacity);
      this.idx = new Int32Array(capacity);
      this.interval = new Int32Array(capacity);
      this.retObj = { index: 0, interval: 0, f: 0, g: 0 };
   }
   clear() { this.size = 0; }
   push(index, interval, f, g) {
      const i = this.size++;
      this.f[i] = f; this.g[i] = g;
      this.idx[i] = index; this.interval[i] = interval;
      this.bubbleUp(i);
   }
   pop() {
      if (this.size === 0) return undefined;
      const ret = this.retObj;
      ret.index = this.idx[0]; ret.interval = this.interval[0];
      ret.f = this.f[0]; ret.g = this.g[0];
      this.size--;
      if (this.size > 0) {
         const last = this.size;
         this.f[0] = this.f[last]; this.g[0] = this.g[last];
         this.idx[0] = this.idx[last]; this.interval[0] = this.interval[last];
         this.bubbleDown(0);
      }
      return ret;
   }
   bubbleUp(i) {
      const f = this.f[i], g = this.g[i], idx = this.idx[i], intv = this.interval[i];
      while (i > 0) {
         const p = (i - 1) >> 1;
         if (this.f[p] < f) break;
         this.f[i] = this.f[p]; this.g[i] = this.g[p];
         this.idx[i] = this.idx[p]; this.interval[i] = this.interval[p];
         i = p;
      }
      this.f[i] = f; this.g[i] = g; this.idx[i] = idx; this.interval[i] = intv;
   }
   bubbleDown(i) {
      const f = this.f[i], g = this.g[i], idx = this.idx[i], intv = this.interval[i];
      const half = this.size >> 1;
      while (i < half) {
         let left = (i << 1) + 1, right = left + 1, best = left;
         if (right < this.size && this.f[right] < this.f[left]) best = right;
         if (f < this.f[best]) break;
         this.f[i] = this.f[best]; this.g[i] = this.g[best];
         this.idx[i] = this.idx[best]; this.interval[i] = this.interval[best];
         i = best;
      }
      this.f[i] = f; this.g[i] = g; this.idx[i] = idx; this.interval[i] = intv;
   }
}

class FastReservationTable {
    constructor() {
        this.incomingInfo = new Int32Array(GRID_SIZE * TIME_HORIZON).fill(-1);
        this.blockedTimes = new Array(GRID_SIZE).fill(null); 
        
        this.parked = new Uint32Array(GRID_SIZE).fill(0xFFFFFFFF);
        this.dirtyIndices = [];
        this.dirtySlots = [];
    }

    reset() {
        const len = this.dirtyIndices.length;
        for (let i = 0; i < len; i++) {
            this.blockedTimes[this.dirtyIndices[i]] = null;
            this.parked[this.dirtyIndices[i]] = 0xFFFFFFFF;
        }
        this.dirtyIndices = [];
        const slotLen = this.dirtySlots.length;
        for (let i = 0; i < slotLen; i++) {
            this.incomingInfo[this.dirtySlots[i]] = -1;
        }
        this.dirtySlots = [];
    }
    isEdgeBlocked(currIdx, nextIdx, time) {
        if (time >= TIME_HORIZON) return false;
        const slot = currIdx + (time * GRID_SIZE);
        return this.incomingInfo[slot] === nextIdx;
    }

    reservePath(path, lockEnd = false) {
        if (!path) return;
        
        for (let i = 0; i < path.length; i++) {
            const step = path[i];
            const t = step.t;
            let times = this.blockedTimes[step.index];
            if (!times) {
                times = [];
                this.blockedTimes[step.index] = times;
                this.dirtyIndices.push(step.index);
            }
            times.push(t);
            if (i > 0 && t < TIME_HORIZON) {
                const prev = path[i-1].index;
                const curr = step.index;
                const slot = curr + (t * GRID_SIZE);
                this.incomingInfo[slot] = prev;
                this.dirtySlots.push(slot);
            }
        }
        if (path.length > 0 && lockEnd) {
            const last = path[path.length - 1];
            this.parked[last.index] = last.t;
        }
    }
}

class OrganicRegionMap {
   constructor() { this.regions = []; }
   build() {
    HPA_GRAPH.clear();
    REGION_TILES.clear();
    this.regions = [];
    REGION_ID_MAP.fill(-1);
    const q = [];
    for (let i = 0; i < GRID_SIZE; i++) {
        if (ObstacleGrid[i]) { 
            CLEARANCE[i] = 0; 
            q.push(i); 
        } else { 
            CLEARANCE[i] = -1; 
        }
    }
    
    let head = 0;
    while (head < q.length) {
        const curr = q[head++];
        const cVal = CLEARANCE[curr];
        const cx = curr % GRID_WIDTH;
        const neighbors = [curr - 1, curr + 1, curr - GRID_WIDTH, curr + GRID_WIDTH];

        for (const n of neighbors) {
            if (n >= 0 && n < GRID_SIZE && CLEARANCE[n] === -1) {
                const nx = n % GRID_WIDTH;
                if (Math.abs(nx - cx) > 1) continue; // Prevent wrap-around
                
                CLEARANCE[n] = cVal + 1;
                q.push(n);
            }
        }
    }

    // 3. Identify Seeds (Local Maxima in Clearance)
    const candidates = [];
    for (let i = 0; i < GRID_SIZE; i++) if (CLEARANCE[i] > 0) candidates.push(i);
    candidates.sort((a, b) => CLEARANCE[b] - CLEARANCE[a]);

    const covered = new Uint8Array(GRID_SIZE).fill(0);
    for (const idx of candidates) {
        if (covered[idx]) continue;
        this.regions.push(idx);
        HPA_GRAPH.set(idx, []);
        // Mask area to prevent seeds from clustering too closely
        this.maskArea(idx, Math.max(MIN_REGION_DIST, CLEARANCE[idx]), covered);
    }

    // 4. Multi-Source Flood Fill (Build Regions & Connectivity Graph)
    const distMap = new Int32Array(GRID_SIZE).fill(0);
    const floodQ = [];

    // Initialize Seeds
    for (let i = 0; i < this.regions.length; i++) {
        const r = this.regions[i];
        REGION_ID_MAP[r] = r;
        floodQ.push(r);
        REGION_TILES.set(r, [r]); // Init tile storage
    }

    head = 0;
    while (head < floodQ.length) {
        const curr = floodQ[head++];
        const myReg = REGION_ID_MAP[curr];
        const cDist = distMap[curr];
        const cx = curr % GRID_WIDTH;
        const neighbors = [curr - 1, curr + 1, curr - GRID_WIDTH, curr + GRID_WIDTH];

        for (const n of neighbors) {
            if (n >= 0 && n < GRID_SIZE && ObstacleGrid[n] === 0) {
                const nx = n % GRID_WIDTH;
                if (Math.abs(nx - cx) > 1) continue;

                const nReg = REGION_ID_MAP[n];

                if (nReg === -1) {
                    // Claim empty tile for this region
                    REGION_ID_MAP[n] = myReg;
                    distMap[n] = cDist + 1;
                    floodQ.push(n);
                    
                    // Store for Organic Search
                    REGION_TILES.get(myReg).push(n); 

                } else if (nReg !== myReg) {
                    // Encountered a different region: Create Edge
                    this.addEdge(myReg, nReg, cDist + 1 + distMap[n]);
                }
            }
        }
    }
   }
   maskArea(center, r, covered) {
      const cx = center % GRID_WIDTH, cy = (center / GRID_WIDTH) | 0;
      const minX = Math.max(0, cx - r), maxX = Math.min(GRID_WIDTH - 1, cx + r);
      const minY = Math.max(0, cy - r), maxY = Math.min(GRID_HEIGHT - 1, cy + r);
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) covered[getIndex(x, y)] = 1;
   }
   addEdge(u, v, realCost) {
      if (u === -1 || v === -1) return;
      if (!HPA_GRAPH.has(u)) HPA_GRAPH.set(u, []);
      if (!HPA_GRAPH.has(v)) HPA_GRAPH.set(v, []);
      const edgesU = HPA_GRAPH.get(u);
      for (let i = 0; i < edgesU.length; i++) if (edgesU[i].to === v) return;
      edgesU.push({ to: v, cost: realCost }); HPA_GRAPH.get(v).push({ to: u, cost: realCost });
   }
}

const GLOBAL_RESERVATIONS = new FastReservationTable();
const GLOBAL_HEAP = new MinCheap(262144);
const INTERVAL_CACHE = new Array(GRID_SIZE).fill(null);
const REGION_SYSTEM = new OrganicRegionMap();
let INTERVAL_GEN = 0;

function getSafeIntervals(index, table, maxTime) {
   const cached = INTERVAL_CACHE[index];
   if (cached && cached.gen === INTERVAL_GEN) return cached.intervals;
   
   const intervals = [];
   const parkedT = table.parked[index];
   const rawTimes = table.blockedTimes[index]; // Sparse Array Access
   
   let count = 0;
   if (rawTimes) {
      for (let i = 0; i < rawTimes.length; i++) TEMP_TIMES[count++] = rawTimes[i];
   }
   
   // If no blockages, return infinite interval immediately (Fast Path)
   if (count === 0) {
      if (parkedT === 0xFFFFFFFF) {
         intervals.push({ start: 0, end: Infinity });
         INTERVAL_CACHE[index] = { gen: INTERVAL_GEN, intervals };
         return intervals;
      }
   }

   // Sort times (Only needed if there are blockages)
   const times = TEMP_TIMES.subarray(0, count);
   times.sort();
   
   let currentStart = 0;
   for (let i = 0; i < count; i++) {
      const t = times[i];
      if (t > maxTime || t >= parkedT) break;
      // Create interval
      if (t > currentStart) intervals.push({ start: currentStart, end: t - 1 });
      currentStart = t + 1;
   }
   
   // Final interval
   if (parkedT === 0xFFFFFFFF) intervals.push({ start: currentStart, end: Infinity });
   else if (currentStart < parkedT) intervals.push({ start: currentStart, end: parkedT - 1 });
   
   INTERVAL_CACHE[index] = { gen: INTERVAL_GEN, intervals };
   return intervals;
}

function findAbstractPath(startIdx, targetIdx) {
   const sR = REGION_ID_MAP[startIdx], tR = REGION_ID_MAP[targetIdx];
   if (sR === -1 || tR === -1) return null;
   if (sR === tR) return [];
   const open = new MinCheap(), cameFrom = new Map(), costSoFar = new Map();
   const d = getManhattanDist(startIdx, sR);
   costSoFar.set(sR, d);
   open.push(sR, 0, d + getManhattanDist(sR, tR), d);
   while (open.size > 0) {
      const current = open.pop(), u = current.index;
      if (u === tR) return reconstructAbstract(cameFrom, u, targetIdx);
      const neighbors = HPA_GRAPH.get(u) || [];
      for (const edge of neighbors) {
         const newCost = costSoFar.get(u) + edge.cost;
         if (!costSoFar.has(edge.to) || newCost < costSoFar.get(edge.to)) {
            costSoFar.set(edge.to, newCost);
            open.push(edge.to, 0, newCost + getManhattanDist(edge.to, tR) * 1.1, newCost);
            cameFrom.set(edge.to, u);
         }
      }
   }
   return null;
}

function reconstructAbstract(cameFrom, current, realTarget) {
   const path = [realTarget, current];
   let safetyCounter = 0;
   while (cameFrom.has(current)) {
      current = cameFrom.get(current); path.push(current);
      if (++safetyCounter > 5000) break;
   }
   return path.reverse();
}

function executeMove(ent, nextNode, tileMap) {
   tileMap.delete(getIndex(ent.endTile.x, ent.endTile.y));
   tileMap.set(getIndex(nextNode.x, nextNode.y), ent);
   ent.path = [nextNode];
   moveEntity(ent);
   PATH_STEP_COUNTER.set(ent.id, (PATH_STEP_COUNTER.get(ent.id) || 0) + 1);
}

function findPathSIPP(startIdx, targetIdx, table, maxTime, heap, maxOps = MAX_EXPANSIONS, startTime = 0) {
    heap.clear();
    INTERVAL_GEN++;
    SIPP_VISITED.clear();
    SIPP_CAME_FROM.clear();
    
    const startInts = getSafeIntervals(startIdx, table, maxTime);
    let startIntIdx = startInts.findIndex(i => startTime >= i.start && startTime <= i.end);
    
    if (startIntIdx === -1) {
        if (startTime === 0) {
            startInts.unshift({start: 0, end: 1});
            startIntIdx = 0;
        } else {
            return [];
        }
    }
    heap.push(startIdx, startIntIdx, getManhattanDist(startIdx, targetIdx) * HEURISTIC_WEIGHT, startTime);
    SIPP_VISITED.set((startIntIdx << 20) | startIdx, startTime);
    let expansions = 0;
    while (heap.size > 0) {
        if (expansions++ > maxOps) break;
        const curr = heap.pop();
        if (curr.index === targetIdx) { return reconstructSIPP(curr, SIPP_CAME_FROM, startInts, startTime); }
        const currInts = (curr.index === startIdx) ? startInts : getSafeIntervals(curr.index, table, maxTime);
        if (!currInts[curr.interval]) continue;
        const currInterval = currInts[curr.interval];
        const neighborStart = NeighborIndex[curr.index];
        const neighborEnd = NeighborIndex[curr.index + 1];
        for (let i = neighborStart; i <= neighborEnd; i++) {
            const nextIdx = (i === neighborEnd) ? curr.index : NeighborData[i];
            if (nextIdx === curr.index) continue;
            const cx = curr.index % GRID_WIDTH; const cy = (curr.index / GRID_WIDTH) | 0;
            const nx = nextIdx % GRID_WIDTH; const ny = (nextIdx / GRID_WIDTH) | 0;
            if (nx !== cx && ny !== cy) {
                if (ObstacleGrid[cy * GRID_WIDTH + nx] || ObstacleGrid[ny * GRID_WIDTH + cx]) continue;
            }

            const nextInts = getSafeIntervals(nextIdx, table, maxTime);
            for (let k = 0; k < nextInts.length; k++) {
                const nextInterval = nextInts[k];
                const moveCost = 1;
                let arrival = curr.g + moveCost;
                
                if (arrival < nextInterval.start) arrival = nextInterval.start;
                if (arrival > maxTime || arrival > nextInterval.end || arrival - moveCost > currInterval.end) continue;
                
                if (table.isEdgeBlocked(curr.index, nextIdx, arrival)) continue;

                const nextKey = (k << 20) | nextIdx;
                const existingG = SIPP_VISITED.get(nextKey);
                if (existingG === undefined || existingG > arrival) {
                    SIPP_VISITED.set(nextKey, arrival);
                    heap.push(nextIdx, k, arrival + getManhattanDist(nextIdx, targetIdx) * HEURISTIC_WEIGHT, arrival);
                    SIPP_CAME_FROM.set(nextKey, { pKey: (curr.interval << 20) | curr.index, t: arrival });
                }
            }
        }
    }
    return [];
}

function reconstructSIPP(endNode, cameFrom, startInts, startTime) {
   const nodes = [];
   let currKey = (endNode.interval << 20) | endNode.index;
   while (cameFrom.has(currKey)) {
      const data = cameFrom.get(currKey);
      nodes.push({ index: currKey & 0xFFFFF, time: data.t });
      currKey = data.pKey;
   }
   const startIdx = currKey & 0xFFFFF;
   nodes.push({ index: startIdx, time: startTime });
   nodes.reverse();
   const path = [];
   if (nodes.length === 0) return path;
   let currT = startTime;
   path.push(fillNodeCoords({ index: nodes[0].index, t: currT }));
   for (let i = 0; i < nodes.length - 1; i++) {
      const curr = nodes[i], next = nodes[i + 1];
      while (currT < next.time - 1) {
         currT++;
         path.push(fillNodeCoords({ index: curr.index, t: currT }));
      }
      currT++;
      path.push(fillNodeCoords({ index: next.index, t: currT }));
   }
   return path;
}