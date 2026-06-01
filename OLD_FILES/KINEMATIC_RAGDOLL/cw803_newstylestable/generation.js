const GEN_REGION_ID_MAP = new Int32Array(GRID_SIZE).fill(-1);

const Gen_Utils = {
   index: (x, y) => x + y * GRID_WIDTH,
   fill: (data, type) => data.fill(type),

   carveRect: (data, x1, y1, x2, y2, type) => {
      const sx = Math.max(0, x1), sy = Math.max(0, y1);
      const ex = Math.min(GRID_WIDTH, x2), ey = Math.min(GRID_HEIGHT, y2);
      const w = GRID_WIDTH;
      for (let y = sy; y < ey; y++) {
         data.fill(type, sx + y * w, ex + y * w);
      }
   },
   
   carveRectWithRegion: (data, regionMap, x1, y1, x2, y2, type, regionId) => {
      const sx = Math.max(0, x1), sy = Math.max(0, y1);
      const ex = Math.min(GRID_WIDTH, x2), ey = Math.min(GRID_HEIGHT, y2);
      const w = GRID_WIDTH;
      for (let y = sy; y < ey; y++) {
         const start = sx + y * w;
         const end = ex + y * w;
         if (type !== -1) data.fill(type, start, end);
         if (regionMap) regionMap.fill(regionId, start, end);
      }
   },
   
   carveCorridor: (data, x1, y1, x2, y2) => {
      let cx = x1, cy = y1;
      const moveXFirst = Math.random() < 0.5;
      const w = GRID_WIDTH;
      const dig = (x, y) => {
         const minX = Math.max(0, x - 1), minY = Math.max(0, y - 1);
         const maxX = Math.min(GRID_WIDTH, x + 2), maxY = Math.min(GRID_HEIGHT, y + 2);
         for (let dy = minY; dy < maxY; dy++) {
            data.fill(T_FLOOR, minX + dy * w, maxX + dy * w);
         }
      };

      while (cx !== x2 || cy !== y2) {
         dig(cx, cy);
         if (moveXFirst) {
            if (cx !== x2) cx += (cx < x2 ? 1 : -1);
            else if (cy !== y2) cy += (cy < y2 ? 1 : -1);
         } else {
            if (cy !== y2) cy += (cy < y2 ? 1 : -1);
            else if (cx !== x2) cx += (cx < x2 ? 1 : -1);
         }
      }
      dig(x2, y2);
   },
   
   countNeighbors: (data, x, y, type) => {
      let count = 0;
      const w = GRID_WIDTH, h = GRID_HEIGHT;
      for (let dy = -1; dy <= 1; dy++) {
         const ny = y + dy;
         if (ny < 0 || ny >= h) continue;
         const row = ny * w;
         for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx >= 0 && nx < w && data[row + nx] === type) count++;
         }
      }
      return count;
   },
   
   connectComplex: (data, bounds) => {
      const { x1, y1, x2, y2 } = bounds;
      const cx = (x1 + x2) >> 1;
      const cy = (y1 + y2) >> 1;
      
      const digLine = (x0, y0, x1, y1) => {
         let x = x0, y = y0;
         const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
         const dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
         let err = dx - dy;
         while (true) {
            Gen_Utils.carveRect(data, x - 1, y - 1, x + 2, y + 2, T_FLOOR);
            if (x === x1 && y === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
         }
      };

      const mapCx = (GRID_WIDTH / 2) | 0;
      const mapCy = (GRID_HEIGHT / 2) | 0;
      
      let bestX = cx, bestY = cy, minDistSq = Infinity;
      
      const candidates = [
         { x: x1 + 1, y: cy }, 
         { x: x2 - 1, y: cy }, 
         { x: cx, y: y1 + 1 }, 
         { x: cx, y: y2 - 1 }  
      ];
      
      for (const p of candidates) {
         const dSq = (p.x - mapCx) ** 2 + (p.y - mapCy) ** 2;
         if (dSq < minDistSq) {
            minDistSq = dSq;
            bestX = p.x;
            bestY = p.y;
         }
      }

      digLine(bestX, bestY, mapCx, mapCy);
   }
};

const Height_Utils = {
    plateau: (heightMap, bounds, height) => {
        const w = GRID_WIDTH;
        for (let y = bounds.y1; y < bounds.y2; y++) {
            for (let x = bounds.x1; x < bounds.x2; x++) {
                heightMap[x + y * w] = height;
            }
        }
    },
};

const Gen_Connectivity = {
   getRegions: (data) => {
      const regions = [];
      const visited = new Uint8Array(GRID_SIZE);
      const stack = new Int32Array(GRID_SIZE);
      const w = GRID_WIDTH;
      for (let i = 0; i < GRID_SIZE; i++) {
         if (visited[i] || data[i] !== T_FLOOR) continue;
         const region = [];
         let sp = 0;
         stack[sp++] = i;
         visited[i] = 1;
         while (sp > 0) {
            const curr = stack[--sp];
            region.push(curr);
            const cx = curr % w;
            const cy = (curr / w) | 0;
            if (cx < w - 1 && !visited[curr + 1] && data[curr + 1] === T_FLOOR) { visited[curr + 1] = 1; stack[sp++] = curr + 1; }
            if (cx > 0 && !visited[curr - 1] && data[curr - 1] === T_FLOOR) { visited[curr - 1] = 1; stack[sp++] = curr - 1; }
            if (cy < GRID_HEIGHT - 1 && !visited[curr + w] && data[curr + w] === T_FLOOR) { visited[curr + w] = 1; stack[sp++] = curr + w; }
            if (cy > 0 && !visited[curr - w] && data[curr - w] === T_FLOOR) { visited[curr - w] = 1; stack[sp++] = curr - w; }
         }
         regions.push(region);
      }
      return regions;
   },
   connectAll: (data, regions) => {
      if (regions.length <= 1) return;
      regions.sort((a, b) => b.length - a.length);
      const main = regions[0];
      const w = GRID_WIDTH;
      for (let i = 1; i < regions.length; i++) {
         const other = regions[i];
         let minD = Infinity, tA = null, tB = null;
         for (let a = 0; a < main.length; a += 5) {
            const pA = main[a];
            const ax = pA % w, ay = (pA / w) | 0;
            for (let b = 0; b < other.length; b += 5) {
               const pB = other[b];
               const bx = pB % w, by = (pB / w) | 0;
               const d = (ax - bx) ** 2 + (ay - by) ** 2;
               if (d < minD) { minD = d; tA = { x: ax, y: ay }; tB = { x: bx, y: by }; }
            }
         }
         if (tA && tB) {
            Gen_Utils.carveCorridor(data, tB.x, tB.y, tA.x, tA.y);
            main.push(...other);
         }
      }
   }
};

const Gen_CaveSystem = {
   generate: (data, centerX, centerY, radius, fillPercent, iterations) => {
      const radSq = radius * radius;
      const outerLimitSq = (radius + 2) ** 2;
      const w = GRID_WIDTH;

      for (let y = 0; y < GRID_HEIGHT; y++) {
         const rOffset = y * w;
         for (let x = 0; x < GRID_WIDTH; x++) {
            const dSq = (x - centerX) ** 2 + (y - centerY) ** 2;
            if (dSq < radSq) {
               data[rOffset + x] = (Math.random() < fillPercent) ? T_WALL : T_FLOOR;
            } else {
               data[rOffset + x] = T_GRASS;
            }
         }
      }

      let buf = new Uint8Array(data);
      for (let i = 0; i < iterations; i++) {
         for (let y = 0; y < GRID_HEIGHT; y++) {
            const rOffset = y * w;
            for (let x = 0; x < GRID_WIDTH; x++) {
               const idx = rOffset + x;
               if ((x - centerX) ** 2 + (y - centerY) ** 2 > outerLimitSq) {
                  buf[idx] = data[idx];
                  continue;
               }
               const n = Gen_Utils.countNeighbors(data, x, y, T_WALL);
               if (data[idx] === T_WALL) buf[idx] = (n < 3) ? T_FLOOR : T_WALL;
               else if (data[idx] === T_FLOOR) buf[idx] = (n > 4) ? T_WALL : T_FLOOR;
               else buf[idx] = data[idx];
            }
         }
         data.set(buf);
      }
   },

   cleanupWalls: (data, centerX, centerY, radius, protectedBounds) => {
      const radSq = radius * radius;
      const innerRadSq = (radius - 2) ** 2;
      const w = GRID_WIDTH;

      for (let y = 0; y < GRID_HEIGHT; y++) {
         const rOffset = y * w;
         for (let x = 0; x < GRID_WIDTH; x++) {
            const idx = rOffset + x;
            const type = data[idx];
            const dSq = (x - centerX) ** 2 + (y - centerY) ** 2;

            let isProtected = false;
            if(protectedBounds) {
               for (const b of protectedBounds) {
                  if (x >= b.x1 && x < b.x2 && y >= b.y1 && y < b.y2) {
                     isProtected = true;
                     break;
                  }
               }
            }

            if (dSq > radSq && !isProtected && type === T_WALL) {
               data[idx] = T_GRASS;
            }
            if (dSq > innerRadSq && type === T_FLOOR) {
               data[idx] = T_FLOOR;
            }
         }
      }
   }
};

const Gen_Barracks = {
    process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.BARRACKS.id;

        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_FLOOR, biomeId);
        
        const outerW = bounds.x2 - bounds.x1;
        const outerH = bounds.y2 - bounds.y1;
        for(let x = bounds.x1; x < bounds.x2; x++) {
            data[Gen_Utils.index(x, bounds.y1)] = T_WALL;
            data[Gen_Utils.index(x, bounds.y2 - 1)] = T_WALL;
        }
        for(let y = bounds.y1; y < bounds.y2; y++) {
            data[Gen_Utils.index(bounds.x1, y)] = T_WALL;
            data[Gen_Utils.index(bounds.x2 - 1, y)] = T_WALL;
        }

        const ROOM_SIZE = 5; 
        
        for (let y = bounds.y1 + 1; y < bounds.y2 - 1; y++) {
            for (let x = bounds.x1 + 1; x < bounds.x2 - 1; x++) {
                const localX = x - bounds.x1;
                const localY = y - bounds.y1;
                
                if (localX % ROOM_SIZE === 0 || localY % ROOM_SIZE === 0) {
                    data[Gen_Utils.index(x, y)] = T_WALL;
                }
            }
        }

        const cx = Math.floor((bounds.x1 + bounds.x2) / 2);
        const cy = Math.floor((bounds.y1 + bounds.y2) / 2);
        
        Gen_Utils.carveRect(data, bounds.x1 + 1, cy - 1, bounds.x2 - 1, cy + 2, T_FLOOR);
        Gen_Utils.carveRect(data, cx - 1, bounds.y1 + 1, cx + 2, bounds.y2 - 1, T_FLOOR);

        // NEW: Place Skeleton Spawns in the main cross corridor area
        Gen_Utils.carveRect(data, cx - 1, cy - 1, cx + 2, cy + 2, T_SPAWN_SKEL);

        for (let y = bounds.y1 + 1; y < bounds.y2 - ROOM_SIZE; y += ROOM_SIZE) {
            for (let x = bounds.x1 + 1; x < bounds.x2 - ROOM_SIZE; x += ROOM_SIZE) {
                
                const cellCx = x + 2;
                const cellCy = y + 2;

                if (data[Gen_Utils.index(cellCx, cellCy)] === T_FLOOR) {
                    if (data[Gen_Utils.index(x, y)] !== T_WALL) continue; 
                }

                if (Math.random() > 0.3) {
                    data[Gen_Utils.index(x + 1, y + 1)] = T_TREE;
                }

                let doorPlaced = false;

                const sWallY = y + ROOM_SIZE;
                if (sWallY < bounds.y2 - 1) {
                    const idx = Gen_Utils.index(cellCx, sWallY);
                    if (Math.abs(sWallY - cy) <= 2 || Math.random() < 0.3) {
                         data[idx] = T_FLOOR;
                         doorPlaced = true;
                    }
                }

                const eWallX = x + ROOM_SIZE;
                if (eWallX < bounds.x2 - 1) {
                    const idx = Gen_Utils.index(eWallX, cellCy);
                    if (Math.abs(eWallX - cx) <= 2 || (!doorPlaced && Math.random() < 0.5)) {
                        data[idx] = T_FLOOR;
                        doorPlaced = true;
                    }
                }
                
                if (!doorPlaced) {
                     const side = Math.floor(Math.random() * 4);
                     if (side === 0) data[Gen_Utils.index(cellCx, y)] = T_FLOOR;
                     else if (side === 1) data[Gen_Utils.index(cellCx, y + ROOM_SIZE)] = T_FLOOR;
                     else if (side === 2) data[Gen_Utils.index(x, cellCy)] = T_FLOOR;
                     else data[Gen_Utils.index(x + ROOM_SIZE, cellCy)] = T_FLOOR;
                }
            }
        }

        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_HiveMaze = {
    process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.HIVE.id;

        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_WALL, biomeId);

        const MIN_SIZE = 4; 
        const MAX_SIZE = 7; 

        const splitContainer = (x1, y1, x2, y2) => {
            const w = x2 - x1;
            const h = y2 - y1;

            if (w <= MAX_SIZE || h <= MAX_SIZE || (w < MAX_SIZE * 1.5 && h < MAX_SIZE * 1.5 && Math.random() < 0.3)) {
                Gen_Utils.carveRect(data, x1 + 1, y1 + 1, x2 - 1, y2 - 1, T_FLOOR);
                
                const cx = (x1 + x2) >> 1;
                const cy = (y1 + y2) >> 1;
                if (w > 4 && h > 4 && Math.random() < 0.5) {
                    data[Gen_Utils.index(cx, cy)] = T_SPAWN_SKEL;
                }
                return;
            }

            let splitH = w > h;
            if (w / h > 1.25) splitH = true;       
            else if (h / w > 1.25) splitH = false; 
            else splitH = Math.random() < 0.5;     

            if (splitH) {
                const splitX = Math.floor(x1 + MIN_SIZE + Math.random() * (w - MIN_SIZE * 2));
                splitContainer(x1, y1, splitX, y2);
                splitContainer(splitX, y1, x2, y2);

                const doorY = Math.floor(y1 + 1 + Math.random() * (h - 2));
                data[Gen_Utils.index(splitX - 1, doorY)] = T_FLOOR; 
                data[Gen_Utils.index(splitX, doorY)] = T_FLOOR;     
                data[Gen_Utils.index(splitX + 1, doorY)] = T_FLOOR; 

            } else {
                const splitY = Math.floor(y1 + MIN_SIZE + Math.random() * (h - MIN_SIZE * 2));
                splitContainer(x1, y1, x2, splitY);
                splitContainer(x1, splitY, x2, y2);

                const doorX = Math.floor(x1 + 1 + Math.random() * (w - 2));
                data[Gen_Utils.index(doorX, splitY - 1)] = T_FLOOR;
                data[Gen_Utils.index(doorX, splitY)] = T_FLOOR;
                data[Gen_Utils.index(doorX, splitY + 1)] = T_FLOOR;
            }
        };

        splitContainer(bounds.x1, bounds.y1, bounds.x2, bounds.y2);

        for (let i = 0; i < 8; i++) {
            const rx = Math.floor(bounds.x1 + 2 + Math.random() * (bounds.x2 - bounds.x1 - 4));
            const ry = Math.floor(bounds.y1 + 2 + Math.random() * (bounds.y2 - bounds.y1 - 4));
            if (data[Gen_Utils.index(rx, ry)] === T_WALL) {
                const idx = Gen_Utils.index(rx, ry);
                const w = GRID_WIDTH;
                const vertical = (data[idx-w] === T_FLOOR && data[idx+w] === T_FLOOR);
                const horizontal = (data[idx-1] === T_FLOOR && data[idx+1] === T_FLOOR);
                if (vertical || horizontal) data[idx] = T_FLOOR;
            }
        }

        const crateDensity = 0.10 + Math.random() * 0.30;
        
        for (let y = bounds.y1 + 1; y < bounds.y2 - 1; y++) {
            for (let x = bounds.x1 + 1; x < bounds.x2 - 1; x++) {
                const idx = Gen_Utils.index(x, y);

                if (data[idx] !== T_FLOOR) continue;
                if (Math.random() > crateDensity) continue;

                const w = GRID_WIDTH;
                const nN = data[idx - w] === T_FLOOR;
                const nS = data[idx + w] === T_FLOOR;
                const nW = data[idx - 1] === T_FLOOR;
                const nE = data[idx + 1] === T_FLOOR;
                
                const isVerticalDoor = (nN && nS && !nW && !nE);
                const isHorizontalDoor = (!nN && !nS && nW && nE);
                
                if (isVerticalDoor || isHorizontalDoor) continue;

                const cN = data[idx - w] === T_TREE;
                const cS = data[idx + w] === T_TREE;
                const cW = data[idx - 1] === T_TREE;
                const cE = data[idx + 1] === T_TREE;

                if (cN || cS || cW || cE) continue;
                
                const floorNeighbors = (nN?1:0) + (nS?1:0) + (nW?1:0) + (nE?1:0);
                if (floorNeighbors === 3) continue;

                data[idx] = T_TREE;
            }
        }

        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_Scaffold = {
    process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.SCAFFOLDING.id;

        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_WALL, biomeId);

        const w = bounds.x2 - bounds.x1;
        const h = bounds.y2 - bounds.y1;
        
        const numNodes = Math.floor((w * h) / 80); 
        const nodes = [];

        for (let i = 0; i < numNodes; i++) {
            const rX = Math.floor(bounds.x1 + 4 + Math.random() * (w - 8));
            const rY = Math.floor(bounds.y1 + 4 + Math.random() * (h - 8));
            
            const rW = 2 + Math.floor(Math.random() * 3); 
            const rH = 2 + Math.floor(Math.random() * 3);

            let tooClose = false;
            for (const n of nodes) {
                const dist = (rX - n.x) ** 2 + (rY - n.y) ** 2;
                if (dist < 25) { tooClose = true; break; } 
            }

            if (!tooClose) {
                Gen_Utils.carveRect(data, rX, rY, rX + rW, rY + rH, T_FLOOR);
                nodes.push({ 
                    x: Math.floor(rX + rW / 2), 
                    y: Math.floor(rY + rH / 2),
                    connected: false 
                });
            }
        }

        if (nodes.length === 0) return; 

        const drawBridge = (n1, n2) => {
            const bridgeWidth = 1 + Math.floor(Math.random() * 2); 
            let cx = n1.x;
            let cy = n1.y;
            const targetX = n2.x;
            const targetY = n2.y;

            const dig = (x, y) => {
                const offset = Math.floor(bridgeWidth / 2);
                Gen_Utils.carveRect(data, x - offset, y - offset, x - offset + bridgeWidth, y - offset + bridgeWidth, T_FLOOR);
            };

            const xFirst = Math.random() < 0.5;

            while (cx !== targetX || cy !== targetY) {
                dig(cx, cy);
                if (xFirst) {
                    if (cx !== targetX) cx += (cx < targetX ? 1 : -1);
                    else cy += (cy < targetY ? 1 : -1);
                } else {
                    if (cy !== targetY) cy += (cy < targetY ? 1 : -1);
                    else cx += (cx < targetX ? 1 : -1);
                }
            }
            dig(targetX, targetY);
        };

        for (let i = 0; i < nodes.length; i++) {
            const current = nodes[i];
            const others = [];
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const d = (current.x - nodes[j].x) ** 2 + (current.y - nodes[j].y) ** 2;
                others.push({ idx: j, dist: d });
            }
            others.sort((a, b) => a.dist - b.dist);
            const connections = Math.min(others.length, 2); 
            for (let k = 0; k < connections; k++) {
                const targetNode = nodes[others[k].idx];
                drawBridge(current, targetNode);
            }
        }

        for (let y = bounds.y1 + 1; y < bounds.y2 - 1; y++) {
            for (let x = bounds.x1 + 1; x < bounds.x2 - 1; x++) {
                const idx = Gen_Utils.index(x, y);
                
                if (data[idx] !== T_FLOOR) continue;

                const voidNeighbors = Gen_Utils.countNeighbors(data, x, y, T_WALL);
                if (voidNeighbors >= 2) continue; 

                // NEW: 10% chance to be a skeleton spawn, otherwise 20% chance for an obstacle
                if (Math.random() < 0.10) {
                    data[idx] = T_SPAWN_SKEL;
                }
                else if (Math.random() < 0.20) {
                    data[idx] = T_TREE;
                }
            }
        }

        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_Stone = {
    decorateRoom: (data, x1, y1, x2, y2) => {
        const w = x2 - x1;
        const h = y2 - y1;
        if (w < 5 || h < 5) return; 

        const type = Math.random();
        
        if (type < 0.4) {
            const spacing = 2;
            for(let y = y1 + 2; y < y2 - 1; y += spacing) {
                for(let x = x1 + 2; x < x2 - 1; x += spacing) {
                    data[Gen_Utils.index(x, y)] = T_WALL;
                }
            }
        } 
        else if (type < 0.7) {
            const cx = (x1 + x2) >> 1;
            const cy = (y1 + y2) >> 1;
            Gen_Utils.carveRect(data, cx - 1, cy - 1, cx + 2, cy + 2, T_WALL);
            data[Gen_Utils.index(x1 + 1, y1 + 1)] = T_WALL;
            data[Gen_Utils.index(x2 - 2, y1 + 1)] = T_WALL;
            data[Gen_Utils.index(x1 + 1, y2 - 2)] = T_WALL;
            data[Gen_Utils.index(x2 - 2, y2 - 2)] = T_WALL;
        }
        else {
             for(let y = y1 + 1; y < y2 - 1; y++) {
                for(let x = x1 + 1; x < x2 - 1; x++) {
                    if (Math.random() < 0.10) {
                         data[Gen_Utils.index(x, y)] = T_TREE;
                    }
                    else if (Math.random() < 0.05) {
                         data[Gen_Utils.index(x, y)] = T_WALL; 
                    }
                }
            }
        }
    },

process: (data, regionMap, bounds, heightMap) => {
        const biomeId = (Math.random() < 0.5) ? Biomes.RUINS.id : Biomes.STONE_COMPLEX.id;
        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_WALL, biomeId);
        
        const w = bounds.x2 - bounds.x1;
        const h = bounds.y2 - bounds.y1;
        const isHoriz = w > h;
        
        let spine = {};
        const spineWidth = 4 + Math.floor(Math.random() * 3); 
        
        if (isHoriz) {
            const cy = Math.floor((bounds.y1 + bounds.y2) / 2);
            spine = { x1: bounds.x1 + 1, y1: cy - (spineWidth>>1), x2: bounds.x2 - 1, y2: cy + (spineWidth>>1) + 1 };
        } else {
            const cx = Math.floor((bounds.x1 + bounds.x2) / 2);
            spine = { x1: cx - (spineWidth>>1), y1: bounds.y1 + 1, x2: cx + (spineWidth>>1) + 1, y2: bounds.y2 - 1 };
        }
        Gen_Utils.carveRect(data, spine.x1, spine.y1, spine.x2, spine.y2, T_FLOOR);
        
        for(let y = spine.y1 + 1; y < spine.y2 - 1; y++) {
            for(let x = spine.x1 + 1; x < spine.x2 - 1; x++) {
                if(Math.random() < 0.05) data[Gen_Utils.index(x, y)] = T_TREE;
                // NEW: Spawns along the main spine
                if(Math.random() < 0.08) data[Gen_Utils.index(x, y)] = T_SPAWN_SKEL;
            }
        }

        const roomMinSize = 6;
        const roomMaxSize = 14;
        
        const tryPlaceRoom = (sx, sy, side) => { 
            let rw = Math.floor(roomMinSize + Math.random() * (roomMaxSize - roomMinSize));
            let rh = Math.floor(roomMinSize + Math.random() * (roomMaxSize - roomMinSize));
            
            let rx1, ry1, rx2, ry2;
            let doorX, doorY;
            
            if (isHoriz) {
                rx1 = sx; 
                rx2 = sx + rw;
                doorX = Math.floor(sx + rw/2);
                
                if (side === -1) { 
                    ry2 = spine.y1 - 1; 
                    ry1 = ry2 - rh;
                    doorY = spine.y1 - 1;
                } else { 
                    ry1 = spine.y2 + 1; 
                    ry2 = ry1 + rh;
                    doorY = spine.y2;
                }
            } else {
                ry1 = sy; 
                ry2 = sy + rh;
                doorY = Math.floor(sy + rh/2);
                
                if (side === -1) { 
                    rx2 = spine.x1 - 1;
                    rx1 = rx2 - rw;
                    doorX = spine.x1 - 1;
                } else { 
                    rx1 = spine.x2 + 1;
                    rx2 = rx1 + rw;
                    doorX = spine.x2;
                }
            }
            
            if (rx1 <= bounds.x1 || ry1 <= bounds.y1 || rx2 >= bounds.x2 || ry2 >= bounds.y2) return;
            
            Gen_Utils.carveRect(data, rx1, ry1, rx2, ry2, T_FLOOR);
            Gen_Utils.carveRect(data, doorX, doorY, doorX + 1, doorY + 1, T_FLOOR);
            Gen_Stone.decorateRoom(data, rx1, ry1, rx2, ry2);
            
            // NEW: Mark a small spawn spot in the side room
            const roomCx = (rx1 + rx2) >> 1;
            const roomCy = (ry1 + ry2) >> 1;
            if (Math.random() < 0.6) {
                data[Gen_Utils.index(roomCx, roomCy)] = T_SPAWN_SKEL;
            }
        };

        if (isHoriz) {
            let currentX = spine.x1 + 2;
            while (currentX < spine.x2 - 6) {
                if (Math.random() > 0.3) tryPlaceRoom(currentX, spine.y1, -1);
                if (Math.random() > 0.3) tryPlaceRoom(currentX, spine.y2, 1);
                currentX += (roomMinSize + 2); 
            }
        } else {
            let currentY = spine.y1 + 2;
            while (currentY < spine.y2 - 6) {
                if (Math.random() > 0.3) tryPlaceRoom(spine.x1, currentY, -1);
                if (Math.random() > 0.3) tryPlaceRoom(spine.x2, currentY, 1);
                currentY += (roomMinSize + 2); 
            }
        }
        
        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_TreeMaze = {
   process: (data, regionMap, bounds, heightMap) => {
      const biomeId = Biomes.TREE_MAZE.id;
      Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_TREE, biomeId);

      const startX = bounds.x1 + 1;
      const startY = bounds.y1 + 1;
      const stack = [{x: startX, y: startY}];
      data[Gen_Utils.index(startX, startY)] = T_FLOOR;

      const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];

      // ... (omitting maze generation loop)
      while (stack.length > 0) {
         const curr = stack[stack.length - 1];
         const candidates = [];

         for (const d of dirs) {
            const nx = curr.x + d[0];
            const ny = curr.y + d[1];
            if (nx > bounds.x1 && nx < bounds.x2 - 1 && ny > bounds.y1 && ny < bounds.y2 - 1) {
               const idx = Gen_Utils.index(nx, ny);
               if (data[idx] === T_TREE) {
                  candidates.push({x: nx, y: ny, mx: curr.x + d[0]/2, my: curr.y + d[1]/2});
               }
            }
         }

         if (candidates.length > 0) {
            const next = candidates[Math.floor(Math.random() * candidates.length)];
            data[Gen_Utils.index(next.mx, next.my)] = T_FLOOR;
            data[Gen_Utils.index(next.x, next.y)] = T_FLOOR;
            stack.push({x: next.x, y: next.y});
         } else {
            stack.pop();
         }
      }

      const degradation = 0.3;
      for(let y = bounds.y1; y < bounds.y2; y++) {
          for(let x = bounds.x1; x < bounds.x2; x++) {
              const idx = Gen_Utils.index(x, y);
              if (data[idx] === T_TREE && Math.random() < degradation) {
                  data[idx] = T_FLOOR;
              }
              // NEW: 10% chance to place a spawn marker on cleared paths
              if (data[idx] === T_FLOOR && Math.random() < 0.10) {
                  data[idx] = T_SPAWN_SKEL;
              }
          }
      }
      
      Gen_Utils.connectComplex(data, bounds);
   }
};

const Gen_Cryo = {
    process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.CRYO_WARD.id;

        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_WALL, biomeId);
        
        const w = bounds.x2 - bounds.x1, h = bounds.y2 - bounds.y1;
        const isHorizontal = w > h;
        if (isHorizontal) {
            const cy = Math.floor((bounds.y1 + bounds.y2) / 2);
            Gen_Utils.carveRect(data, bounds.x1 + 2, cy - 1, bounds.x2 - 2, cy + 2, T_FLOOR);
            const ribSpacing = 5; 
            for (let x = bounds.x1 + 4; x < bounds.x2 - 4; x += ribSpacing) {
                Gen_Utils.carveRect(data, x, bounds.y1 + 2, x + 3, cy, T_FLOOR);
                Gen_Utils.carveRect(data, x, cy + 1, x + 3, bounds.y2 - 2, T_FLOOR);
                
                // NEW: Mark the center of the upper and lower chamber for spawning
                data[Gen_Utils.index(x + 1, cy - 2)] = T_SPAWN_SKEL;
                data[Gen_Utils.index(x + 1, cy + 3)] = T_SPAWN_SKEL;
                
                for (let py = bounds.y1 + 3; py < cy - 1; py += 3) {
                    const idx = Gen_Utils.index(x + 1, py);
                    data[idx] = T_WALL; data[idx + GRID_WIDTH] = T_WALL;
                }
                for (let py = cy + 3; py < bounds.y2 - 3; py += 3) {
                    const idx = Gen_Utils.index(x + 1, py);
                    data[idx] = T_WALL; data[idx + GRID_WIDTH] = T_WALL;
                }
            }
        } else {
            const cx = Math.floor((bounds.x1 + bounds.x2) / 2);
            Gen_Utils.carveRect(data, cx - 1, bounds.y1 + 2, cx + 2, bounds.y2 - 2, T_FLOOR);
            const ribSpacing = 5; 
            for (let y = bounds.y1 + 4; y < bounds.y2 - 4; y += ribSpacing) {
                Gen_Utils.carveRect(data, bounds.x1 + 2, y, cx, y + 3, T_FLOOR);
                Gen_Utils.carveRect(data, cx + 1, y, bounds.x2 - 2, y + 3, T_FLOOR);
                
                // NEW: Mark the center of the left and right chamber for spawning
                data[Gen_Utils.index(cx - 2, y + 1)] = T_SPAWN_SKEL;
                data[Gen_Utils.index(cx + 3, y + 1)] = T_SPAWN_SKEL;
                
                for (let px = bounds.x1 + 3; px < cx - 1; px += 3) {
                    const idx = Gen_Utils.index(px, y + 1);
                    data[idx] = T_WALL; data[idx + 1] = T_WALL;
                }
                for (let px = cx + 3; px < bounds.x2 - 3; px += 3) {
                    const idx = Gen_Utils.index(px, y + 1);
                    data[idx] = T_WALL; data[idx + 1] = T_WALL;
                }
            }
        }
        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_Office = {
    fillOfficeRoom: (data, x1, y1, x2, y2) => {
        const w = x2 - x1, h = y2 - y1;
        if (w < 4 || h < 4) return; 

        if (Math.random() < 0.25) {
            data[Gen_Utils.index(x1 + 1, y1 + 1)] = T_TREE;
            data[Gen_Utils.index(x2 - 2, y2 - 2)] = T_TREE;
            return;
        }

        const cellW = 3, cellH = 3;
        for (let y = y1 + 1; y < y2 - 1; y += cellH) {
            for (let x = x1 + 1; x < x2 - 1; x += cellW) {
                if (x + 1 < x2 - 1 && y + 1 < y2 - 1) {
                    data[Gen_Utils.index(x + 1, y + 1)] = T_TREE;
                }
            }
        }
        if (Math.random() < 0.25) {
            const cx = (x1 + x2) >> 1;
            const cy = (y1 + y2) >> 1;
            data[Gen_Utils.index(cx, cy)] = T_SPAWN_SKEL;
        }

        if (Math.random() < 0.25) {
            data[Gen_Utils.index(x1 + 1, y1 + 1)] = T_TREE;
            data[Gen_Utils.index(x2 - 2, y2 - 2)] = T_TREE;
            return;
        }
        for (let y = y1 + 1; y < y2 - 1; y += cellH) {
            for (let x = x1 + 1; x < x2 - 1; x += cellW) {
                if (x + 1 < x2 - 1 && y + 1 < y2 - 1) {
                    data[Gen_Utils.index(x + 1, y + 1)] = T_TREE;
                }
            }
        }
    },
    
   process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.OFFICE_COMPLEX.id;

        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_WALL, biomeId);
        
        const w = bounds.x2 - bounds.x1, h = bounds.y2 - bounds.y1;
        const isHorizontal = w > h;
        if (isHorizontal) {
            const cy = Math.floor((bounds.y1 + bounds.y2) / 2);
            Gen_Utils.carveRect(data, bounds.x1, cy, bounds.x2, cy + 2, T_FLOOR);
            
            const buildRow = (yStart, yEnd, doorY) => {
                let currentX = bounds.x1 + 2;
                while (currentX < bounds.x2 - 6) {
                    const roomW = 4 + Math.floor(Math.random() * 4);
                    if (currentX + roomW > bounds.x2 - 2) break;
                    
                    const roomX2 = currentX + roomW;
                    Gen_Utils.carveRect(data, currentX, yStart, roomX2, yEnd, T_FLOOR);
                    Gen_Office.fillOfficeRoom(data, currentX, yStart, roomX2, yEnd);
                    
                    const doorX = Math.floor(currentX + roomW / 2);
                    Gen_Utils.carveRect(data, doorX, Math.min(yEnd, doorY), doorX + 1, Math.max(yStart, doorY + 1), T_FLOOR);
                    
                    currentX += roomW + 2; 
                }
            };
            buildRow(bounds.y1 + 2, cy - 2, cy - 1);
            buildRow(cy + 4, bounds.y2 - 2, cy + 2);
        } else {
            const cx = Math.floor((bounds.x1 + bounds.x2) / 2);
            Gen_Utils.carveRect(data, cx, bounds.y1, cx + 2, bounds.y2, T_FLOOR);
            
            const buildCol = (xStart, xEnd, doorX) => {
                let currentY = bounds.y1 + 2;
                while (currentY < bounds.y2 - 6) {
                    const roomH = 4 + Math.floor(Math.random() * 4);
                    if (currentY + roomH > bounds.y2 - 2) break;
                    
                    const roomY2 = currentY + roomH;
                    Gen_Utils.carveRect(data, xStart, currentY, xEnd, roomY2, T_FLOOR);
                    Gen_Office.fillOfficeRoom(data, xStart, currentY, xEnd, roomY2);
                    
                    const doorY = Math.floor(currentY + roomH / 2);
                    Gen_Utils.carveRect(data, Math.min(xEnd, doorX), doorY, Math.max(xStart, doorX + 1), doorY + 1, T_FLOOR);
                    
                    currentY += roomH + 2;
                }
            };
            buildCol(bounds.x1 + 2, cx - 2, cx - 1);
            buildCol(cx + 4, bounds.x2 - 2, cx + 2);
        }
        
        // NEW: Mark the main corridor intersection for spawning
        const cx = Math.floor((bounds.x1 + bounds.x2) / 2);
        const cy = Math.floor((bounds.y1 + bounds.y2) / 2);
        Gen_Utils.carveRect(data, cx - 1, cy - 1, cx + 2, cy + 2, T_SPAWN_SKEL);
        
        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_Cargo = {
   process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.CARGO_DECK.id;

        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_WALL, biomeId);
        Gen_Utils.carveRect(data, bounds.x1 + 1, bounds.y1 + 1, bounds.x2 - 1, bounds.y2 - 1, T_FLOOR); 

        const startX = bounds.x1 + 3, startY = bounds.y1 + 3, endX = bounds.x2 - 3, endY = bounds.y2 - 3;
        
        for (let y = startY; y < endY; y += 4) {
            for (let x = startX; x < endX; x += 4) {
                if (Math.random() < 0.15) continue; 
                
                for (let cy = 0; cy < 2; cy++) {
                    for (let cx = 0; cx < 2; cx++) {
                        if ((x + cx) < bounds.x2 - 1 && (y + cy) < bounds.y2 - 1) {
                            data[Gen_Utils.index(x + cx, y + cy)] = T_TREE;
                        }
                    }
                }
            }
        }

        const removalChance = 0.20; 
        for (let y = bounds.y1 + 1; y < bounds.y2 - 1; y++) {
            for (let x = bounds.x1 + 1; x < bounds.x2 - 1; x++) {
                const idx = Gen_Utils.index(x, y);
                if (data[idx] === T_TREE && Math.random() < removalChance) {
                    data[idx] = T_FLOOR;
                }
                // NEW: 10% chance to be a skeleton spawn marker on open floor
                if (data[idx] === T_FLOOR && Math.random() < 0.10) {
                    data[idx] = T_SPAWN_SKEL;
                }
            }
        }

        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_ServerFarm = {
    process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.SERVER_FARM.id;
      
        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_WALL, biomeId);
        Gen_Utils.carveRect(data, bounds.x1 + 1, bounds.y1 + 1, bounds.x2 - 1, bounds.y2 - 1, T_FLOOR);

        const w = bounds.x2 - bounds.x1;
        const h = bounds.y2 - bounds.y1;
        const cx = Math.floor((bounds.x1 + bounds.x2) / 2);
        const cy = Math.floor((bounds.y1 + bounds.y2) / 2);
        
        const margin = 2; 
        const aisleSize = 4;
        
        if (w > h) { 
            for (let x = bounds.x1 + margin; x < bounds.x2 - margin; x++) {
                if ((x - bounds.x1) % 3 !== 0) {
                    for (let y = bounds.y1 + margin; y < bounds.y2 - margin; y++) {
                        if (Math.abs(y - cy) > aisleSize / 2) {
                             if (Math.random() > 0.05) {
                                 data[Gen_Utils.index(x, y)] = T_TREE;
                             }
                        }
                    }
                }
            }
        } else { 
            for (let y = bounds.y1 + margin; y < bounds.y2 - margin; y++) {
                if ((y - bounds.y1) % 3 !== 0) {
                    for (let x = bounds.x1 + margin; x < bounds.x2 - margin; x++) {
                        if (Math.abs(x - cx) > aisleSize / 2) {
                             if (Math.random() > 0.05) {
                                 data[Gen_Utils.index(x, y)] = T_TREE;
                             }
                        }
                    }
                }
            }
        }

        const coreSize = 6;
        Gen_Utils.carveRect(data, cx - 4, cy - 4, cx + 5, cy + 5, T_FLOOR); 
        
        for(let y = cy - 2; y <= cy + 2; y++) {
            for(let x = cx - 2; x <= cx + 2; x++) {
                if (x === cx - 2 || x === cx + 2 || y === cy - 2 || y === cy + 2) {
                    data[Gen_Utils.index(x, y)] = T_TREE;
                }
            }
        }

        Gen_Utils.carveRect(data, cx - 1, cy - 1, cx + 2, cy + 2, T_SPAWN_SKEL);

        Gen_Utils.connectComplex(data, bounds);
    }
};

const Gen_Collider = {
    process: (data, regionMap, bounds, heightMap) => {
        const biomeId = Biomes.COLLIDER_COMPLEX.id;
        

        Gen_Utils.carveRectWithRegion(data, regionMap, bounds.x1, bounds.y1, bounds.x2, bounds.y2, T_GRASS, biomeId);

        const w = bounds.x2 - bounds.x1, h = bounds.y2 - bounds.y1;
        const cx = Math.floor(bounds.x1 + w / 2), cy = Math.floor(bounds.y1 + h / 2);
        
        const WALL_THICKNESS = 3; 
        const FLOOR_WIDTH = 5;    
        
        let currentRx = w / 2 * 0.9, currentRy = h / 2 * 0.9; 
        const minCourtyard = 10, maxLayers = 2, layers = [];
        let layerCount = 0;
        
        const isInEllipse = (x, y, rX, rY) => {
             const dx = x - cx, dy = y - cy;
             return (dx*dx)/(rX*rX) + (dy*dy)/(rY*rY) <= 1;
        };

        while (currentRx > minCourtyard + WALL_THICKNESS*2 + FLOOR_WIDTH && layerCount < maxLayers) {
            
            const rOuterWall = currentRx, ryOuterWall = currentRy;
            const rFloorStart = rOuterWall - WALL_THICKNESS, ryFloorStart = ryOuterWall - WALL_THICKNESS;
            const rFloorEnd = rFloorStart - FLOOR_WIDTH, ryFloorEnd = ryFloorStart - FLOOR_WIDTH;
            const rInnerWallEnd = rFloorEnd - WALL_THICKNESS, ryInnerWallEnd = ryFloorEnd - WALL_THICKNESS;
            
            layers.push({ 
                cx: cx, cy: cy, 
                rFloor: rFloorStart, ryFloor: ryFloorStart, 
                rInner: rFloorEnd, ryInner: ryFloorEnd 
            });

            for (let y = bounds.y1; y < bounds.y2; y++) {
                for (let x = bounds.x1; x < bounds.x2; x++) {
                    const idx = y * GRID_WIDTH + x;

                    if (isInEllipse(x, y, rOuterWall, ryOuterWall) && !isInEllipse(x, y, rFloorStart, ryFloorStart)) {
                        data[idx] = T_WALL;
                    }
                    else if (isInEllipse(x, y, rFloorStart, ryFloorStart) && !isInEllipse(x, y, rFloorEnd, ryFloorEnd)) {
                        data[idx] = T_FLOOR;
                    }
                    else if (isInEllipse(x, y, rFloorEnd, ryFloorEnd) && !isInEllipse(x, y, rInnerWallEnd, ryInnerWallEnd)) {
                        data[idx] = T_WALL;
                    }
                }
            }
            currentRx = rInnerWallEnd; currentRy = ryInnerWallEnd; layerCount++;
        }
        
        Gen_Utils.carveRect(data, cx - minCourtyard/2, cy - minCourtyard/2, cx + minCourtyard/2 + 1, cy + minCourtyard/2 + 1, T_FLOOR);

        for (let l = 0; l < layers.length; l++) {
            const layer = layers[l];
            const numSegments = 8; 
            
            for (let i = 0; i < numSegments; i++) {
                const angle = (i / numSegments) * Math.PI * 2;
                
                const midRadius = (layer.rFloor + layer.rInner) / 2;
                const midRyRadius = (layer.ryFloor + layer.ryInner) / 2;
                const roomCx = Math.floor(cx + Math.cos(angle) * midRadius);
                const roomCy = Math.floor(cy + Math.sin(angle) * midRyRadius);
                const rw = 2 + Math.floor(Math.random() * 2), rh = 2 + Math.floor(Math.random() * 2);
                Gen_Utils.carveRect(data, roomCx - rw, roomCy - rh, roomCx + rw, roomCy + rh, T_FLOOR);
                data[Gen_Utils.index(roomCx, roomCy)] = T_TREE; 

                if (l < layers.length - 1) {
                    const nextLayer = layers[l+1];
                    const x1 = Math.floor(cx + Math.cos(angle) * layer.rInner); 
                    const y1 = Math.floor(cy + Math.sin(angle) * layer.ryInner);
                    const x2 = Math.floor(cx + Math.cos(angle) * nextLayer.rFloor); 
                    const y2 = Math.floor(cy + Math.sin(angle) * nextLayer.ryFloor);
                    Gen_Utils.carveCorridor(data, x1, y1, x2, y2);
                }
            }
        }
        
        Gen_Utils.connectComplex(data, bounds);
    }
};

function generateDungeon() {
    const data = new Uint8Array(GRID_SIZE);
    const regionMap = new Uint8Array(GRID_SIZE); 
    const heightMap = new Float32Array(GRID_SIZE).fill(1.0);

    const cx = (GRID_WIDTH / 2) | 0;
    const cy = (GRID_HEIGHT / 2) | 0;
    
    const caveRadius = Math.floor(GRID_WIDTH * 0.5);

    // 1. Generate Base Cave
    Gen_CaveSystem.generate(data, cx, cy, caveRadius, 0.45, 5); 

    // 3. Biome Regions (Voronoi)
    const caveVariants = BiomeList
        .filter(b => b.tags && b.tags.includes('cave_variant'))
        .map(b => b.id);

    const flavorIds = [Biomes.CAVE.id, Biomes.CAVE.id, ...caveVariants];
    const numSeeds = Math.floor(GRID_WIDTH / 4); 
    const seeds = [];
    
    for (let i = 0; i < numSeeds; i++) {
        seeds.push({
            x: Math.floor(Math.random() * GRID_WIDTH),
            y: Math.floor(Math.random() * GRID_HEIGHT),
            biome: flavorIds[Math.floor(Math.random() * flavorIds.length)]
        });
    }

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            let closestDist = Infinity;
            let chosenBiome = Biomes.CAVE.id;

            for (let s = 0; s < numSeeds; s++) {
                const dx = x - seeds[s].x;
                const dy = y - seeds[s].y;
                const dist = dx*dx + dy*dy;
                if (dist < closestDist) {
                    closestDist = dist;
                    chosenBiome = seeds[s].biome;
                }
            }
            regionMap[y * GRID_WIDTH + x] = chosenBiome;
        }
    }

    // 4. Place Structures
    const BASE_MIN = Math.floor(GRID_WIDTH * 0.05); 
    const BASE_MAX = Math.floor(GRID_WIDTH * 0.15); 
    
    const definitions = [
        { gen: Gen_Collider,   count: 1,  scale: 1.0 },
        { gen: Gen_Cryo,       count: 1,  scale: 1.0 },
        { gen: Gen_Office,     count: 1,  scale: 1.0 },
        { gen: Gen_Cargo,      count: 1,  scale: 1.0 },
        { gen: Gen_ServerFarm, count: 1,  scale: 1.0 },
        { gen: Gen_Stone,      count: 1,  scale: 1.0 },
        { gen: Gen_TreeMaze,   count: 1,  scale: 1.0 },
        { gen: Gen_Barracks,   count: 1,  scale: 1.0 },
        { gen: Gen_HiveMaze,   count: 1,  scale: 1.0 },
        { gen: Gen_Scaffold,   count: 1,  scale: 1.0 },
    ];

    let spawnPool = [];
    for(const def of definitions) {
        const mapAreaScale = (GRID_WIDTH * GRID_HEIGHT) / (128 * 128);
        const count = Math.max(1, Math.floor(def.count * Math.sqrt(mapAreaScale))); 
        for(let i=0; i<count; i++) spawnPool.push(def);
    }
    
    for (let i = spawnPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [spawnPool[i], spawnPool[j]] = [spawnPool[j], spawnPool[i]];
    }

    const placements = [];
    const minDist = 8; 

    for (const item of spawnPool) {
        let placed = false;
        for (let attempt = 50; attempt > 0; attempt--) {
            const targetW = Math.floor((BASE_MIN + Math.random() * (BASE_MAX - BASE_MIN)) * item.scale);
            const targetH = Math.floor((BASE_MIN + Math.random() * (BASE_MAX - BASE_MIN)) * item.scale);
            const px = 15 + Math.floor(Math.random() * (GRID_WIDTH - targetW - 30));
            const py = 15 + Math.floor(Math.random() * (GRID_HEIGHT - targetH - 30));

            let overlap = false;
            for (const p of placements) {
                if (px < p.x2 + minDist && px + targetW > p.x1 - minDist &&
                    py < p.y2 + minDist && py + targetH > p.y1 - minDist) {
                    overlap = true;
                    break;
                }
            }

            if (!overlap) {
                const newBounds = { x1: px, y1: py, x2: px + targetW, y2: py + targetH, type: item.gen };
                placements.push(newBounds);
                item.gen.process(data, regionMap, newBounds, heightMap);
                placed = true;
                break; 
            }
        }
    }

    Gen_Connectivity.connectAll(data, Gen_Connectivity.getRegions(data));
    Gen_CaveSystem.cleanupWalls(data, cx, cy, caveRadius, placements);

    // 5. Populate Trees/Obstacles
    for (let y = 1; y < GRID_HEIGHT - 1; y++) {
        for (let x = 1; x < GRID_WIDTH - 1; x++) {
            const idx = Gen_Utils.index(x, y);
            if (data[idx] === T_FLOOR && Math.random() < 0.05) {
                const rId = regionMap[idx];
                const regionBiome = BiomeList[rId];
                
                if (regionBiome && regionBiome.tags.includes('cave')) { 
                    if (Gen_Utils.countNeighbors(data, x, y, T_FLOOR) === 8) {
                        data[idx] = T_TREE;
                    }
                }
            }
        }
    }

 const types = ['grass', 'wall', 'floor', 'tree'];
    
   for (let i = 0; i < GRID_SIZE; i++) {
        const x = i % GRID_WIDTH;
        const y = (i / GRID_WIDTH) | 0;
        let t = data[i];

        if (x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1) t = T_WALL;
        
        let typeStr = types[t] || 'floor';
        let isBlock = (t === T_WALL || t === T_TREE);
        
        if (t === T_SPAWN_SKEL) {
             ObstacleGrid[i] = 0;
             typeStr = 'floor';
             if (!cells[i]) cells[i] = { x, y, explored: false };
             cells[i].startingEntity = 'skeleton';
             isBlock = false;
        } else if (isBlock) {
            if (t === T_WALL && regionMap[i] === Biomes.SCAFFOLDING.id) ObstacleGrid[i] = 2;
            else ObstacleGrid[i] = 1;
        } else {
            ObstacleGrid[i] = 0; 
        }

        if(t === T_TREE) ObstacleGrid[i] = 3;

        if (!cells[i]) cells[i] = { x, y, explored: false };
        cells[i].type = typeStr;
        cells[i].selected = isBlock;
        cells[i].regionId = regionMap[i]; 
        
        const regionBiome = BiomeList[regionMap[i]];
        if (regionBiome && regionBiome.maxSkeletons) {
            cells[i].maxRegionSkeletons = regionBiome.maxSkeletons;
        }
        
        cells[i].z = (t === T_WALL) ? heightMap[i] : 0;
    }
    return cells;
}