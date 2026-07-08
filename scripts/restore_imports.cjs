const fs = require("fs");
const file = "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation/NavCore.js";
let text = fs.readFileSync(file, "utf8");
const imports = `import { IdxMinHeap } from "../DataStructures/MinHeap.js";
import { PathfindingWorkerClient } from "./PathfindingWorkerClient.js";
import { CARDINAL_DCOL, CARDINAL_DR, OCTILE_DCOL, OCTILE_DR, OCTILE_STEP_COST, OCTILE_DIR_COUNT, circleIntersectsAabb, createAabb } from "../Math/math.js";
import { manhattanDistanceIdx, octileDistanceIdx, makeAdjacencyKey, boundaryBlocksStepFrom, recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto, isNavTopologyReady, CELL_EDGE_SLOT_BYTES, cellEdgeSlotOffset, cellInRect, diagonalStepOpen, getCardinalBit, edgeNeighborIdx, hasLineOfSight, worldColAtOrigin, worldRowAtOrigin, cellBoundsForGrid, forEachDenseCellInBounds, padCellIdxToGrid, padCellBoundsInPlace, forEachDenseCellInRect, gridNavCacheKey, centeredGridFrameKey, createCenteredGridFrame, getCellBoundsInCenteredFrameInto, gridCenterXInCenteredFrame, gridCenterYInCenteredFrame, setCenteredGridFrameCenter, worldColInCenteredFrame, worldRowInCenteredFrame, isEmptyCellBounds, unionCellBounds, isIdxInMapGenBounds, stampLayoutFromConfig, forEachStampGlobalIdx, gridCellLayout, corridorPathHitsOccupied } from "../Spatial/spatial.js";
import { FloorBelt } from "../Spatial/belts.js";
import { PortalLink } from "../Spatial/portals.js";
import { MAX_HPA_REPLAN_SLOTS } from "./HpaPathWorker.js";
import { resolveBodyRadius, physicsSettings, getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward, clearGroundRollDrive, decelerateRoll } from "../Physics/physics.js";
import { FlowFieldGrid } from "./NavFlowField.js";

`;
fs.writeFileSync(file, imports + text);
console.log("Imports restored");
