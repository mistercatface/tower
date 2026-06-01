let chaseTimer = 0;
const CHASE_COOLDOWN = 16.0;

const UPDATE_INTERVAL = 1;
let updateFrameIndex = 0;

const PATH_REQUEST_QUEUE = [];
const AGENTS_IN_QUEUE = new Set();
let RESERVATION_BUILD_PHASE = true;

const REGION_STATUS = new Map();

let lastKnownTarget = { x: 0, y: 0 };
let lastChaseTarget = { x: 0, y: 0 }

const BEHAVIOR_CONFIG = {
   PATROL_ROUTE: {
      moveState: 'CASUAL_MOVING',
      speed: SPEEDS.WALK,
      markBusy: false,
   },
   SECTOR_SEARCH: {
      moveState: 'MOVING_TO_REGION',
      speed: SPEEDS.RUN,
      markBusy: true,
   },
   FOLLOW_LEADER: {
      moveState: 'MOVING_TO_REGION',
      speed: SPEEDS.RUN,
      markBusy: false,
   },
   CHASE: {
      moveState: 'CHASE',
      speed: SPEEDS.RUN,
      markBusy: false,
   },
   MISSION_PATH: {
      moveState: 'MOVING_TO_REGION', 
      speed: SPEEDS.WALK,
      markBusy: false,
   }
};

const SquadManager = {
   status: 'IDLE',
   startRegion: -1,
   searchQueue: [],
   visitedSet: new Set(),
   candidates: [],
   squadData: [],
   auctionIndex: 0,
   FRAME_BUDGET: 3,
   requestPatrol(startRegion) {
      this.startRegion = startRegion;
      this.searchQueue = [{ id: startRegion, depth: 0 }];
      this.visitedSet.clear();
      this.visitedSet.add(startRegion);
      this.candidates = [];
      this.status = 'GATHER';
   },
   update() {
      if (this.status === 'IDLE') return;
      const startTime = performance.now();
      if (this.status === 'GATHER') {
         const queue = this.searchQueue;
         const visited = this.visitedSet;
         const results = this.candidates;
         const MAX_CANDIDATES = 12;
         while (queue.length > 0) {
            if (performance.now() - startTime > this.FRAME_BUDGET) return;
            if (results.length >= MAX_CANDIDATES) {
               this.status = 'SETUP_AUCTION';
               return;
            }
            const { id: u, depth } = queue.shift();
            results.push(u);
            if (depth >= 15) continue;
            const edges = HPA_GRAPH.get(u);
            if (edges) {
               for (const edge of edges) {
                  if (!visited.has(edge.to)) {
                     visited.add(edge.to);
                     queue.push({ id: edge.to, depth: depth + 1 });
                  }
               }
            }
         }
         this.status = 'SETUP_AUCTION';
      }
      if (this.status === 'SETUP_AUCTION') {
         const regions = this.candidates;
         if (regions.length === 0) {
            this.status = 'IDLE';
            return;
         }
         this.squadData = cultists.map(c => { return { agent: c, x: c.x, y: c.y, simTime: 0, assignedQueue: [] }; });
         this.auctionIndex = 0;
         this.status = 'AUCTION';
      }
      if (this.status === 'AUCTION') {
         const squad = this.squadData;
         const regions = this.candidates;
         const DISTANCE_WEIGHT = 2.0;
         const SEARCH_COST = 6;
         while (this.auctionIndex < regions.length) {
            if (performance.now() - startTime > this.FRAME_BUDGET) return;
            const rId = regions[this.auctionIndex];
            const tiles = REGION_TILES.get(rId);
            let rx = 0, ry = 0;
            if (tiles && tiles.length > 0) {
               // Find a walkable tile for the squad target
               let cIdx = tiles[Math.floor(tiles.length / 2)];
               if (ObstacleGrid[cIdx] !== 0) {
                   for (const t of tiles) {
                       if (ObstacleGrid[t] === 0) { cIdx = t; break; }
                   }
               }
               rx = cIdx % GRID_WIDTH;
               ry = (cIdx / GRID_WIDTH) | 0;
            }
            let bestCandidate = null;
            let bestScore = Infinity;
            let travelDistForBest = 0;
            for (const cand of squad) {
               const dist = Math.abs(cand.x - rx) + Math.abs(cand.y - ry);
               if (dist > 300) continue;
               const score = cand.simTime + (dist * DISTANCE_WEIGHT);
               if (score < bestScore) {
                  bestScore = score;
                  bestCandidate = cand;
                  travelDistForBest = dist;
               }
            }
            if (bestCandidate) {
               bestCandidate.assignedQueue.push(rId);
               bestCandidate.x = rx;
               bestCandidate.y = ry;
               bestCandidate.simTime += travelDistForBest + SEARCH_COST;
            }
            this.auctionIndex++;
         }
         this.status = 'FINALIZE';
      }
      if (this.status === 'FINALIZE') {
         this.squadData.forEach(item => {
            item.agent.regionQueue = item.assignedQueue;
            item.agent.regionQueueIndex = 0;
            if (item.agent.patrolState === 'IDLE' || item.agent.patrolState === 'PATROL_ROUTE') {
               item.agent.patrolState = 'SECTOR_SEARCH';
               item.agent.cbsTarget = null;
            }
         });
         this.status = 'IDLE';
         this.searchQueue = [];
         this.visitedSet.clear();
         this.candidates = [];
         this.squadData = [];
      }
   }
};

function generateLongDistanceRoute(startRegionId) {
   if (startRegionId === -1 || !HPA_GRAPH.has(startRegionId)) return [];
   
   // 1. Find all reachable regions
   const queue = [{ id: startRegionId, dist: 0, path: [startRegionId] }];
   const visited = new Set([startRegionId]);
   let farthestNode = { id: startRegionId, dist: 0, path: [] };

   while (queue.length > 0) {
      const current = queue.shift();
      
      if (current.dist > farthestNode.dist) {
         farthestNode = current;
      }

      const edges = HPA_GRAPH.get(current.id);
      if (edges) {
         for (const edge of edges) {
            if (!visited.has(edge.to)) {
               visited.add(edge.to);
               queue.push({
                  id: edge.to,
                  dist: current.dist + 1,
                  path: [...current.path, edge.to]
               });
            }
         }
      }
   }
   
   return farthestNode.path;
}

function advancePatrolQueue(agent) {
    if (agent.leader) {
        const leader = agent.leader;
        if (leader.patrolState === 'IDLE') {
            agent.patrolState = 'IDLE';
            return;
        }
        agent.patrolState = 'FOLLOW_LEADER';
        agent.speed = (leader.patrolState === 'CHASE' || leader.patrolState === 'SECTOR_SEARCH')  ? SPEEDS.RUN : SPEEDS.WALK;
        const distSq = (agent.x - leader.x)**2 + (agent.y - leader.y)**2;
        if (distSq > 150) agent.speed = SPEEDS.RUN;
        return; 
    }

    // --- LEADER / SOLO LOGIC ---
    let intent = agent.patrolState;
    if (!agent.regionQueue || agent.regionQueueIndex >= agent.regionQueue.length) {
       if ((intent === 'MISSION_PATH' || agent.isMissionObjective) && agent.regionQueue && agent.regionQueue.length > 0) {
          agent.regionQueueIndex = 0;
          agent.patrolState = 'MISSION_PATH'; 
          intent = 'MISSION_PATH';
       } else {
          agent.patrolState = 'IDLE';
          return;
       }
    }
    const config = BEHAVIOR_CONFIG[intent];
    if (!config) {
        agent.patrolState = 'IDLE';
        return;
    }
    if (!agent.leader) {
       if (!agent.regionQueue || agent.regionQueueIndex >= agent.regionQueue.length) {
          agent.patrolState = 'IDLE';
          return;
       }
       const nextRegion = agent.regionQueue[agent.regionQueueIndex];
       const st = REGION_STATUS.get(nextRegion);
       if (config.markBusy && st && st.status === 'CLEARED') {
          agent.regionQueueIndex++;
          return;
       }
       agent.regionLock = nextRegion;
       agent.regionQueueIndex++;
       if (config.markBusy && st && st.status === 'UNSEARCHED') { st.status = 'BUSY'; }
   }
   agent.patrolState = config.moveState;
   if (!agent.leader) agent.speed = config.speed;
   const tiles = REGION_TILES.get(agent.regionLock);
   if (tiles && tiles.length > 0) {
      let centerIdx = tiles[Math.floor(tiles.length / 2)];
      if (ObstacleGrid[centerIdx] !== 0) {
          for (const t of tiles) {
              if (ObstacleGrid[t] === 0) { centerIdx = t; break; }
          }
      }
      agent.cbsTarget = { x: centerIdx % GRID_WIDTH, y: (centerIdx / GRID_WIDTH) | 0 };
      requestPath(agent);
   } else {
      agent.patrolState = intent;
      agent.regionLock = -1;
   }
}

function reassignSquadsByProximity() {
   cultists.forEach(c => { 
       if (!c.isMissionObjective) {
           c.leader = null; 
           c.isLeader = false; 
       }
   });
   const unassigned = cultists.filter(c => !c.isDying && !c.isMissionObjective);
   const SQUAD_DIST_SQ = 12 * 12;
   for (let i = 0; i < unassigned.length; i++) {
      let leader = unassigned[i];
      if (leader.leader) continue; 
      leader.isLeader = true;
      let squadCount = 1;
      for (let j = i + 1; j < unassigned.length; j++) {
          let other = unassigned[j];
          if (other.leader) continue;
          if (squadCount >= 4) break;
          const dSq = (leader.x - other.x)**2 + (leader.y - other.y)**2;
          if (dSq < SQUAD_DIST_SQ) {
             other.leader = leader;
             other.isLeader = false;
             squadCount++;
          }
      }
   }
}

function getNeighborhoodRegions(startRegion, maxDepth) {
    const queue = [{ id: startRegion, depth: 0 }];
    const visited = new Set([startRegion]);
    const results = new Map();

    while (queue.length > 0) {
        const { id: u, depth } = queue.shift();
        results.set(u, { id: u, depth: depth });

        if (depth >= maxDepth) continue;

        const edges = HPA_GRAPH.get(u);
        if (edges) {
            for (const edge of edges) {
                if (!visited.has(edge.to)) {
                    visited.add(edge.to);
                    queue.push({ id: edge.to, depth: depth + 1 });
                }
            }
        }
    }
    return results;
}

function initializePatrol() {
    if (REGION_SYSTEM.regions.length === 0) REGION_SYSTEM.build();
    resetPatrolLogic();
    reassignSquadsByProximity();
    
    RESERVATION_BUILD_PHASE = true;
    COOP_PATHS.clear();
    PATH_STEP_COUNTER.clear();
    
    AITarget.x = lastKnownTarget.x;
    AITarget.y = lastKnownTarget.y;
    const lkpIdx = getIndex(AITarget.x, AITarget.y);
    const lkpRegion = REGION_ID_MAP[lkpIdx];
    if (lkpRegion !== -1 && lkpRegion !== undefined) {
        const st = REGION_STATUS.get(lkpRegion);
        if (st) {
            const standardPoints = generateRegionPoints(lkpRegion);
            const specificLKP = {
                x: Math.floor(AITarget.x),
                y: Math.floor(AITarget.y)
            };
            st.pendingPoints = [specificLKP, ...standardPoints];
            st.initialized = true;
        }
    }
    
    const MAX_PATH_DISTANCE = 64; 
    const lkpDistances = bfsDistancesWindow(AITarget.x, AITarget.y, MAX_PATH_DISTANCE); 
    let availableAgents = [];

    cultists.forEach(ent => {
         if (ent.isMissionObjective) return;
        if (ent.isDying) return;
        ent.speed = SPEEDS.RUN; 
        ent.regionLock = -1;
        ent.cbsTarget = null;
        ent.patrolState = 'IDLE';
        ent.regionQueue = [];
        ent.regionQueueIndex = 0;
        const agentIdx = getIndex(ent.endTile.x, ent.endTile.y);
        const dist = lkpDistances[agentIdx];
        if (dist !== -1 && !ent.leader) { 
            availableAgents.push({ agent: ent, dist: dist }); 
        }
    });
    
    availableAgents.sort((a, b) => a.dist - b.dist);
    let agentPool = availableAgents.map(item => item.agent); 
    let assignedAgentIds = new Set();
    let regionTargets = new Map();
    if (lkpRegion !== -1 && lkpRegion !== undefined) {
        regionTargets = getNeighborhoodRegions(lkpRegion, 2); 
    }
    
    const LKP_INVESTIGATOR_COUNT = 2;
    if (regionTargets.has(lkpRegion) && agentPool.length > 0) {
        const target = { x: AITarget.x, y: AITarget.y };
        for (let i = 0; i < LKP_INVESTIGATOR_COUNT; i++) {
            const ent = agentPool.shift();
            if (!ent) break; 
            assignedAgentIds.add(ent.id);
            ent.patrolState = 'INVESTIGATING';
            ent.speed = SPEEDS.RUN;
            ent.cbsTarget = { x: target.x, y: target.y };
            ent.regionLock = lkpRegion;
            requestPath(ent);
        }
        regionTargets.delete(lkpRegion); 
    }
    const neighboringRegions = Array.from(regionTargets.values()).sort((a, b) => a.depth - b.depth);
    for (const targetRegion of neighboringRegions) {
        if (agentPool.length === 0) break;
        
        const rId = targetRegion.id;
        const tiles = REGION_TILES.get(rId);
        
        if (tiles && tiles.length > 0) {
            let centerIdx = tiles[Math.floor(tiles.length / 2)];
            if (ObstacleGrid[centerIdx] !== 0) {
                for (const t of tiles) {
                    if (ObstacleGrid[t] === 0) { centerIdx = t; break; }
                }
            }
            
            if (ObstacleGrid[centerIdx] === 0) {
                const target = { x: centerIdx % GRID_WIDTH, y: (centerIdx / GRID_WIDTH) | 0 };
                const ent = agentPool.shift();
                ent.patrolState = 'INVESTIGATING';
                ent.speed = SPEEDS.RUN;
                ent.cbsTarget = target;
                ent.regionLock = rId;
                const st = REGION_STATUS.get(rId);
                if (st) {
                     if (st.status === 'UNSEARCHED') st.status = 'BUSY';
                     if (!st.initialized) {
                        st.pendingPoints = generateRegionPoints(rId);
                        st.initialized = true;
                    }
                }
                
                assignedAgentIds.add(ent.id);
                requestPath(ent);
            }
        }
    }
    for (let i = PATH_REQUEST_QUEUE.length - 1; i >= 0; i--) {
        if (!assignedAgentIds.has(PATH_REQUEST_QUEUE[i].id)) {
            AGENTS_IN_QUEUE.delete(PATH_REQUEST_QUEUE[i].id);
            PATH_REQUEST_QUEUE.splice(i, 1);
        }
    }
    if (lkpRegion !== -1 && lkpRegion !== undefined) planSquadPatrol(lkpRegion);
}

function updateAgentPatrolLogic() {
   for (const agent of cultists) {
      if (agent.isDying) continue;
      if (AGENTS_IN_QUEUE.has(agent.id)) continue;
      if (agent.leader && shouldReturnToLeader(agent)) {
          agent.patrolState = 'FOLLOW_LEADER';
          agent.cbsTarget = null;
      }
      switch (agent.patrolState) {
         case 'IDLE':
            //handled by coordinatePatrol()
            break; 
         case 'INVESTIGATING':
            handleInvestigating(agent);
            break;
         case 'MOVING_TO_REGION':
            handleMovingToRegion(agent);
            break;
         case 'SEARCHING':
            handleSearching(agent);
            break;
         case 'CASUAL_MOVING':
            handleCasualMoving(agent);
            break;
         case 'FOLLOW_LEADER':
             //usually handled by advancePatrolQueue, but simple arrival check here
             if (hasArrived(agent)) agent.cbsTarget = null; 
             break;
      }
   }
}

// Helper: Checks if a follower is too far from leader or leader changed regions
function shouldReturnToLeader(agent) {
    const leader = agent.leader;
    if (agent.regionLock !== -1 && leader.regionLock !== -1 && agent.regionLock !== leader.regionLock) {
        return true;
    }
    return false;
}

function handleInvestigating(agent) {
   // 1. Check if pathfinding failed (no target, not waiting)
   if (!agent.cbsTarget) {
       console.log("Agent " + agent.id + " failed to path to investigation target. Aborting.");
       agent.patrolState = 'IDLE';
       return;
   }

   // 2. Check Arrival
   if (hasArrived(agent)) {
       // Transition to Searching
       agent.patrolState = 'SEARCHING';
       agent.cbsTarget = null;
   }
}

function handleMovingToRegion(agent) {
   // 1. Check if pathfinding failed
   if (!agent.cbsTarget) {
       agent.patrolState = 'IDLE';
       return;
   }

   // 2. Check Arrival
   if (hasArrived(agent)) {
       // Initialize points if needed
       const regionData = REGION_STATUS.get(agent.regionLock);
       if (regionData && !regionData.initialized) {
          regionData.pendingPoints = generateRegionPoints(agent.regionLock);
          regionData.initialized = true;
       }
       // Transition
       agent.patrolState = 'SEARCHING';
       agent.cbsTarget = null; // Clear target so Searching can pick a new one
   }
}

function handleCasualMoving(agent) {
   if (!agent.cbsTarget || hasArrived(agent)) {
       agent.regionLock = -1;
       agent.cbsTarget = null;
       agent.patrolState = 'PATROL_ROUTE'; // Hand back to advancePatrolQueue
   }
}

function handleSearching(agent) {
   // 1. If we are currently moving towards a specific search point:
   if (agent.cbsTarget) {
       if (hasArrived(agent)) {
           agent.cbsTarget = null; // We made it. Now we need a NEW point.
       } else {
           return; // Still walking to the point. Do nothing.
       }
   }

   // 2. We need a new point. Try to claim one.
   const regionData = REGION_STATUS.get(agent.regionLock);
   const task = regionData ? claimBestSharedPoint(agent, regionData) : null;

   if (task) {
       // FOUND A POINT: Go there.
       agent.cbsTarget = { x: task.x, y: task.y };
       requestPath(agent);
   } else {
       // NO POINTS LEFT: We are done with this region.
       
       // Mark region cleared if empty
       if (regionData && regionData.pendingPoints && regionData.pendingPoints.length === 0) {
           regionData.status = 'CLEARED';
       }

       // Decide where to go next
       if (agent.leader) {
           agent.patrolState = 'FOLLOW_LEADER';
           agent.cbsTarget = null;
       } 
       else if (agent.regionQueue && agent.regionQueueIndex < agent.regionQueue.length) {
           // We have a queue (Squad behavior), go get the next region
           agent.regionLock = -1;
           agent.patrolState = 'SECTOR_SEARCH'; // Hand back to advancePatrolQueue
           agent.cbsTarget = null;
       } 
       else {
           // No queue (Investigator behavior), we are done.
           agent.regionLock = -1;
           agent.patrolState = 'IDLE';
           agent.cbsTarget = null;
       }
   }
}

function handleIdleBehavior(agent) {
   if (SquadManager.status !== 'IDLE') return;
   if (agent.leader) {
      if (agent.leader.patrolState !== 'IDLE') {
         agent.patrolState = 'FOLLOW_LEADER';
      }
   } 
   else {
      const idx = getIndex(agent.endTile.x, agent.endTile.y);
      const currentRegion = REGION_ID_MAP[idx];
      if (currentRegion !== undefined && currentRegion !== -1) {
         const newRoute = generateCasualPatrolRoute(currentRegion);
         if (newRoute.length > 0) {
            agent.regionQueue = newRoute;
            agent.regionQueueIndex = 0;
            agent.patrolState = 'PATROL_ROUTE';
            agent.speed = SPEEDS.SNEAK;
            return;
         }
      }
   }
   const now = Date.now();
   if (!agent.lastRadioTime) agent.lastRadioTime = 0;
   if (now - agent.lastRadioTime > 5000) {
      const idx = getIndex(agent.endTile.x, agent.endTile.y);
      const currentRegion = REGION_ID_MAP[idx];
      if (currentRegion === -1 || currentRegion === undefined) {
         const recovery = findNearestValidRegion(agent.x, agent.y);
         if (recovery) {
            agent.cbsTarget = { x: recovery.x, y: recovery.y };
            agent.regionLock = recovery.regionId;
            agent.patrolState = 'SECTOR_SEARCH';
            agent.speed = SPEEDS.RUN;
            requestPath(agent);
            console.log('requestiong new path (old radio function)');
         }
      }
      agent.lastRadioTime = now;
   }
}

function triggerGlobalAlert(spotter) {
   let alertLocation = null;
   const isAlreadyChasing = chaseTimer > 0;
   if (spotter.seesPlayer) {
      alertLocation = { x: character.endTile.x, y: character.endTile.y };
   } 
   else if (spotter.hearingGunshot && spotter.noiseTarget) {
      if (!isAlreadyChasing) {
         alertLocation = { x: spotter.noiseTarget.x, y: spotter.noiseTarget.y };
      }
   } 
   if (alertLocation) {
      setLastKnownTarget(alertLocation.x, alertLocation.y);
      chaseTimer = CHASE_COOLDOWN;
      spotter.lookTarget = null;
      spotter.hearingGunshot = false;
   }
}

function planSquadPatrol(lkpRegion) {
   let searchStartRegion = lkpRegion;
   if (searchStartRegion === -1 || !HPA_GRAPH.has(searchStartRegion)) {
      const cx = Math.floor(AITarget.x);
      const cy = Math.floor(AITarget.y);
      let found = false;
      for (let r = 1; r <= 8; r++) {
         for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
               const idx = (cy + y) * GRID_WIDTH + (cx + x);
               if (idx >= 0 && idx < GRID_SIZE) {
                  const rId = REGION_ID_MAP[idx];
                  if (rId !== undefined && rId !== -1 && HPA_GRAPH.has(rId)) {
                     searchStartRegion = rId;
                     found = true;
                     break;
                  }
               }
            }
            if (found) break;
         }
         if (found) break;
      }
      if (!found) {
         const keys = HPA_GRAPH.keys();
         const first = keys.next();
         if (!first.done) searchStartRegion = first.value;
         else return;
      }
   }
   SquadManager.requestPatrol(searchStartRegion);
}

function resetPatrolLogic() {
   PATH_REQUEST_QUEUE.length = 0;
   AGENTS_IN_QUEUE.clear();
   REGION_STATUS.clear();
   for (const [rId, tiles] of REGION_TILES) {
      REGION_STATUS.set(rId, { id: rId, status: 'UNSEARCHED', pendingPoints: [], initialized: false });
   }
}

function generateRegionPoints(rId) {
   const tiles = REGION_TILES.get(rId);
   if (!tiles || tiles.length === 0) return [];
   const centerIdx = tiles[Math.floor(tiles.length / 2)];
   const cx = centerIdx % GRID_WIDTH;
   const cy = (centerIdx / GRID_WIDTH) | 0;
   let sortedTiles = [];
   for (let i = 0; i < tiles.length; i += 2) {
      const tIdx = tiles[i];
      if (ObstacleGrid[tIdx] === 0) {
         const tx = tIdx % GRID_WIDTH;
         const ty = (tIdx / GRID_WIDTH) | 0;
         const dist = (tx - cx) ** 2 + (ty - cy) ** 2;
         sortedTiles.push({ x: tx, y: ty, d: dist });
      }
   }
   sortedTiles.sort((a, b) => b.d - a.d);
   const candidates = [];
   if (ObstacleGrid[centerIdx] === 0) { candidates.push({ x: cx, y: cy }); }
   if (sortedTiles.length > 0) candidates.push(sortedTiles[0]);
   if (sortedTiles.length > 1) candidates.push(sortedTiles[1]);
   return candidates;
}

function claimBestSharedPoint(agent, regionData) {
   if (!regionData.pendingPoints || regionData.pendingPoints.length === 0) return null;
   let bestDist = Infinity;
   let bestIndex = -1;
   const ax = agent.x;
   const ay = agent.y;
   for (let i = 0; i < regionData.pendingPoints.length; i++) {
      const p = regionData.pendingPoints[i];
      const d = (p.x - ax) ** 2 + (p.y - ay) ** 2;
      if (d < bestDist) {
         bestDist = d;
         bestIndex = i;
      }
   }
   if (bestIndex !== -1) {
      return regionData.pendingPoints.splice(bestIndex, 1)[0];
   }
   return null;
}

function findNearestValidRegion(agentX, agentY, searchRadius = 5) {
   const startX = Math.floor(agentX);
   const startY = Math.floor(agentY);
   for (let r = 1; r <= searchRadius; r++) {
      for (let y = -r; y <= r; y++) {
         for (let x = -r; x <= r; x++) {
            const cx = startX + x;
            const cy = startY + y;
            if (cx < 0 || cx >= GRID_WIDTH || cy < 0 || cy >= GRID_HEIGHT) continue;
            const idx = cy * GRID_WIDTH + cx;
            if (ObstacleGrid[idx] === 0) {
               const rId = REGION_ID_MAP[idx];
               if (rId !== undefined && rId !== -1) {
                  return { regionId: rId, x: cx, y: cy };
               }
            }
         }
      }
   }
   return null;
}

function generateCasualPatrolRoute(startRegionId) {
   if (startRegionId === -1 || !HPA_GRAPH.has(startRegionId)) return [];
   const route = [];
   const visited = new Set([startRegionId]);
   let current = startRegionId;
   const TARGET_LENGTH = 8 + Math.floor(Math.random() * 4); 
   for (let i = 0; i < TARGET_LENGTH; i++) {
      const edges = HPA_GRAPH.get(current);
      if (!edges || edges.length === 0) break;
      let candidates = edges.filter(e => !visited.has(e.to)); 
      if (candidates.length === 0) {
         const previous = (route.length > 0) ? route[route.length - 1] : -1;
         let potentialBacktrack = edges.filter(e => e.to === previous);
         
         if (potentialBacktrack.length === 1 && edges.length === 1) {
             candidates = potentialBacktrack;
         } else {
             break; 
         }
      }
      if (candidates.length === 0) break;
      const nextEdge = candidates[Math.floor(Math.random() * candidates.length)];
      route.push(nextEdge.to);
      visited.add(nextEdge.to); 
      current = nextEdge.to;
   }
   if (route.length > 2) {
      const lastRegion = route[route.length - 1];
      const lastEdges = HPA_GRAPH.get(lastRegion);
      if (lastEdges && lastEdges.some(e => e.to === startRegionId)) {
         route.push(startRegionId);
      }
   }
   return route;
}

function servicePathfindingQueue() {
   if (PATH_REQUEST_QUEUE.length === 0) return;
   const FRAME_BUDGET_MS = 15;
   const startTime = performance.now();
   if (RESERVATION_BUILD_PHASE) {
      GLOBAL_RESERVATIONS.reset();
      for (const ent of cultists) {
         if (AGENTS_IN_QUEUE.has(ent.id)) continue;
         if (COOP_PATHS.has(ent.id)) {
            const path = COOP_PATHS.get(ent.id);
            const step = PATH_STEP_COUNTER.get(ent.id) || 0;
            if (step < path.length) {
               const futurePath = [];
               const lookahead = Math.min(path.length, step + 40);
               for (let i = step; i < lookahead; i++) {
                  futurePath.push({ index: path[i].index, t: i - step });
               }
               GLOBAL_RESERVATIONS.reservePath(futurePath, false);
            }
         }
      }
      RESERVATION_BUILD_PHASE = false;
   }
   let processedCount = 0;
   while (PATH_REQUEST_QUEUE.length > 0) {
      if (processedCount > 20 && (performance.now() - startTime > FRAME_BUDGET_MS)) break;
      const agent = PATH_REQUEST_QUEUE.shift();
      AGENTS_IN_QUEUE.delete(agent.id);
      processedCount++;
      if (!agent.cbsTarget) continue;
      const sIdx = agent.endTile.y * GRID_WIDTH + agent.endTile.x;
      const tIdx = agent.cbsTarget.y * GRID_WIDTH + agent.cbsTarget.x;
      if (ObstacleGrid[sIdx] || ObstacleGrid[tIdx]) {
         agent.cbsTarget = null;
         continue;
      }
      if (sIdx === tIdx) {
         agent.cbsTarget = null;
         continue;
      }
      const path = findPathSIPP(sIdx, tIdx, GLOBAL_RESERVATIONS, 200, GLOBAL_HEAP, MAX_EXPANSIONS, 0);
      if (path && path.length > 0) {
         COOP_PATHS.set(agent.id, path);
         PATH_STEP_COUNTER.set(agent.id, 0);
         const resPath = [];
         for (let i = 0; i < path.length; i++) resPath.push({ index: path[i].index, t: path[i].t });
         GLOBAL_RESERVATIONS.reservePath(resPath, false);
      } else {
         agent.cbsTarget = null;
         COOP_PATHS.delete(agent.id);
      }
   }
   if (PATH_REQUEST_QUEUE.length === 0) RESERVATION_BUILD_PHASE = true;
}

function handleSquadPromotions() {
   let reorganizationNeeded = false;

   for (const agent of cultists) {
      if (agent.isDying) continue;
      if (agent.leader && agent.leader.isDying) {
         agent.leader = null;
         agent.isLeader = true;
         agent.patrolState = 'IDLE';
         agent.regionLock = -1;
         agent.regionQueue = [];
         reorganizationNeeded = true;
      }
   }
   if (reorganizationNeeded) {}
}

function updateAIState(deltaTime) {
   handleSquadPromotions();
   cultists.forEach(agent => { processAgentVision(agent); });
   AITarget.x = lastKnownTarget.x;
   AITarget.y = lastKnownTarget.y;

   if (chaseTimer > 0) {
      AITarget.x = character.endTile.x;
      AITarget.y = character.endTile.y;
      chaseTimer -= deltaTime;
      if (chaseTimer <= 0) {
         initializePatrol();
         cultists.forEach(ent => {
            // Restore mission path if they were chasing, or idle
            if (ent.patrolState === 'CHASE') {
                if (ent.isMissionObjective) ent.patrolState = 'MISSION_PATH';
                else ent.patrolState = 'IDLE';
            }
         });
      }
   }

   patrolTimer += deltaTime;
   if (patrolTimer >= AI_UPDATE_INTERVAL) {
      patrolTimer = 0;
      if (chaseTimer > 0) {
         updateDistances(AITarget.x, AITarget.y);
         cultists.forEach(ent => {
            if (ent.isDying) return;
            const idx = getIndex(ent.endTile.x, ent.endTile.y);
            const dist = globalDists[idx];
            if (dist !== -1 && dist <= 64) {
               if (ent.patrolState !== 'CHASE') {
                  ent.patrolState = 'CHASE';
                  ent.speed = SPEEDS.RUN;
                  ent.cbsTarget = null;
               }
            }
         });
      } 
      coordinatePatrol();
   }
   updateAgentPatrolLogic();
   servicePathfindingQueue();
   SquadManager.update();
}

function requestPath(agent) {
   if (!AGENTS_IN_QUEUE.has(agent.id)) {
      AGENTS_IN_QUEUE.add(agent.id);
      PATH_REQUEST_QUEUE.push(agent);
   }
}

function hasArrived(agent) {
   if (!agent.cbsTarget) return true;
   const distSq = (agent.x - agent.cbsTarget.x) ** 2 + (agent.y - agent.cbsTarget.y) ** 2;
   if (distSq < 1.5) {
      agent.cbsTarget = null;
      return true;
   }
   return false;
}

function coordinatePatrol() {
   updateFrameIndex = (updateFrameIndex + 1) % UPDATE_INTERVAL;
   if (updateFrameIndex !== 0) return;
   for (const agent of cultists) {
      if (agent.patrolState === 'CHASE') continue;
      if (BEHAVIOR_CONFIG[agent.patrolState]) {
         advancePatrolQueue(agent);
      } else if (agent.patrolState === 'IDLE') {
         handleIdleBehavior(agent);
      }
   }
}

function setLastKnownTarget(rawX, rawY) {
   let cx = Math.floor(rawX);
   let cy = Math.floor(rawY);
   cx = Math.max(0, Math.min(cx, GRID_WIDTH - 1));
   cy = Math.max(0, Math.min(cy, GRID_HEIGHT - 1));
   const isValid = (x, y) => {
      if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return false;
      return ObstacleGrid[getIndex(x, y)] === 0;
   };
   if (isValid(cx, cy)) {
      lastKnownTarget.x = cx;
      lastKnownTarget.y = cy;
      return;
   }
   for (let r = 1; r <= 3; r++) {
      for (let y = -r; y <= r; y++) {
         for (let x = -r; x <= r; x++) {
            if (Math.abs(x) !== r && Math.abs(y) !== r) continue;
            const nx = cx + x;
            const ny = cy + y;
            if (isValid(nx, ny)) {
               lastKnownTarget.x = nx;
               lastKnownTarget.y = ny;
               return;
            }
         }
      }
   }
   lastKnownTarget.x = cx;
   lastKnownTarget.y = cy;
}