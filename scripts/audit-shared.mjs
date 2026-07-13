import fs from "node:fs";
import path from "node:path";

export const DELETED_PASSTHROUGH_EXPORTS = [
    "DRAG_LAUNCH_BASELINE",
    "GLASS_MAX_SHARDS_PER_SHATTER",
    "LivePolygonShape",
    "SCRATCH_AGENT_POSE",
    "SCRATCH_PATH_STEERING",
    "SPAWNER_BEHAVIOR_ID",
    "addAdjacencyEdge",
    "agentPose",
    "allocLiveGeomSpan",
    "allowsKineticCollisionPair",
    "applyChunkGeometryToProp",
    "applyFractureGeometryToProp",
    "assetSupportsDragLaunch",
    "boundaryBlocksStep",
    "boundsToCellRect",
    "buildAdjacency",
    "cellBoundsFromStampLayout",
    "clearGridWallsQuiet",
    "collectExposedWallEdgesInAabb",
    "_chunkKeyRange",
    "createWallFaceAxes",
    "createCueStrikeBehavior",
    "createDragLaunchFacingBehavior",
    "createDragLaunchInteraction",
    "createDragLaunchWaitBehavior",
    "createFractureGameSession",
    "createGlassGameSession",
    "createGroundNavBehavior",
    "createKineticTick",
    "createNavGraphViewFromTopology",
    "createPolygonPrimitive",
    "createSpawnerBehavior",
    "DIRECT_GROUND_NAV_CONFIG",
    "createDragLaunchAim",
    "createDragLaunchBehaviors",
    "updateDragLaunchAim",
    "writeDragLaunchPreviewInto",
    "releaseDragLaunch",
    "getDragLaunchAimLine",
    "appendDragLaunchOverlayCommands",
    "ensureTargetWorld",
    "getOrCreatePropRun",
    "GRAB_DRAG_BEHAVIOR_ID",
    "DRAG_LAUNCH_BEHAVIOR_ID",
    "DIRECT_GROUND_NAV_BEHAVIOR_ID",
    "FLOW_GROUND_NAV_BEHAVIOR_ID",
    "HPA_GROUND_NAV_BEHAVIOR_ID",
    "entityIntersectsAabbEidF32",
    "expandNavTopologyBakeBounds",
    "F_OUT_POS_X",
    "F_OUT_POS_Y",
    "F_VEC_B",
    "F_VEC_C",
    "F_VEC_D",
    "fillRandomBuffer",
    "filterWalkableCellsInBounds",
    "fireSpawner",
    "FLOW_GROUND_NAV_CONFIG",
    "getChainMemberIds",
    "getDragLaunchConfig",
    "getKineticConstraintGraph",
    "getMoveTargetWorld",
    "getPropRadius",
    "getKineticRollConfigForStopRadius",
    "getKineticRollConfig",
    "getOrEnsureWallAtlasScalars",
    "hueToPickerHex",
    "HPA_GROUND_NAV_CONFIG",
    "integrateRollOrientation",
    "inverseMassFromBody",
    "isBlockFamilyAsset",
    "isEntityAsleep",
    "isEntityAtRest",
    "isFaceTowardViewer",
    "isKinetic",
    "isNavWalkableCellAtIndex",
    "isSandboxPointerSelectableProp",
    "isShapeFamilyAsset",
    "isSpawnerProp",
    "isSpawnerWorldProp",
    "kineticSleepScratch",
    "kineticTickFromState",
    "listSpawnerSpawnPropIds",
    "localBoxOutline",
    "mapGenerationCellBounds",
    "momentOfInertiaFromBody",
    "parseGlassLaunchSizePx",
    "preparedSearchState",
    "paintBakeRequest",
    "paintOptions",
    "P_OUT_WALL_X",
    "P_OUT_WALL_Y",
    "P_OUT_WALL_Z",
    "P_OUT_WALL_IDX",
    "PRIMITIVE_PHYSICS_ROWS",
    "pairContactKey",
    "contactWarmStartKey",
    "areKineticLinkNeighbors",
    "quantizeCardinalAngle",
    "queryPropIdsInView",
    "radiusAtT",
    "railWallEdgeFromStamp",
    "releaseLiveGeomSpan",
    "remapChunkCoord",
    "removeSandboxWorldProp",
    "resolveBodyRadius",
    "resolveChunkBaseProfileIdAtIdx",
    "resolveChunkSurfaceProfileIdAtKey",
    "resolveCellSurfaceProfileId",
    "resolveDragLaunchConfig",
    "resolvePaintCellSize",
    "resolveWallSurfaceProfileId",
    "runCellularAutomataBuffer",
    "sandboxAssetDragInteract",
    "sandboxAssetMatchesTagFilter",
    "satCheckCollision",
    "scaleAtHeight",
    "selectionRingRadius",
    "setPropRadius",
    "sleepContactBuffer",
    "SS_AXES",
    "SS_CELL",
    "SS_DRAW",
    "snapshotWorldCol",
    "snapshotWorldRow",
    "spawnLinkedBallChain",
    "stampMarqueeAabb",
    "stampOverlayCircleFillStrokeColor",
    "stampOverlayCircleStrokeColor",
    "stampOverlaySegmentStroke",
    "stampRailEdgeSegment",
    "stepCardinalFacing",
    "syncEntitySlotPoseFromRef",
    "validateStepConfig",
    "ViewBounds",
    "wallAtlasKey",
    "wallAtlasRevision",
    "wallFaceColumns",
    "wallPaintOptions",
    "wallPhysics",
    "writeWallFaceAxes",
    "worldSimFromState",
    "worldToChunkKey",
    "wrapChunkKey",
    "writeStaticKineticSlabSlot",
    "writebackActiveKineticBodySlab",
    "writebackEntitySlotPoseToRef",
    "worldPropContainsPoint",
    "worldPropFootprintInto",
    "appendGridEdgeOverlayCommand",
    "patchKineticPairsForBodies",
    "appendMarqueeOverlayCommands",
    "buildDragLaunchAimLineContext",
    "buildHpaGroundNavPathSettings",
    "dragLaunchAimLineContextForState",
    "worldAnchorFromBodyIntoF32",
    "appendStaticWallSegmentsNear",
    "shouldResolveKineticPair",
    "isMovingEntity",
    "isRotatingEntity",
    "isKinematicallyActive",
    "kineticIntegrateHooks",
];

export const LEGACY_SCALAR_SYMBOLS = [
    { pattern: /neighborGridDims/, label: "neighborGridDims" },
    { pattern: /gridToWorldByIdx/, label: "gridToWorldByIdx" },
    { pattern: /gridToWorldInCenteredFrame/, label: "gridToWorldInCenteredFrame" },
    { pattern: /worldToGridInCenteredFrame/, label: "worldToGridInCenteredFrame" },
    { pattern: /CARDINAL_OFFSETS/, label: "CARDINAL_OFFSETS" },
    { pattern: /gridSideOutwardVector/, label: "gridSideOutwardVector" },
    { pattern: /cellBoundsScratch/, label: "cellBoundsScratch" },
    { pattern: /ENTITY_AABB_SCRATCH/, label: "ENTITY_AABB_SCRATCH" },
    { pattern: /readSlabIntoBounds/, label: "readSlabIntoBounds" },
    { pattern: /\bSLAB_SCRATCH/, label: "SLAB_SCRATCH" },
    { pattern: /seenPrimaryScratch/, label: "seenPrimaryScratch" },
    { pattern: /wallBestScratch/, label: "wallBestScratch" },
    { pattern: /\bposScratch\b/, label: "posScratch" },
    { pattern: /COMPOUND_BOUNDS_SCRATCH/, label: "COMPOUND_BOUNDS_SCRATCH" },
    { pattern: /pairBroadphaseBoundsOverlap/, label: "pairBroadphaseBoundsOverlap" },
    { pattern: /\bpairBroadphaseOverlap\b/, label: "pairBroadphaseOverlap" },
    { pattern: /getBroadphaseBounds/, label: "getBroadphaseBounds" },
    { pattern: /writeBroadphaseFromBounds/, label: "writeBroadphaseFromBounds" },
    { pattern: /broadphaseBounds/, label: "broadphaseBounds" },
    { pattern: /getCircleSegmentPenetration/, label: "getCircleSegmentPenetration" },
    { pattern: /manifoldPoints/, label: "manifoldPoints" },
    { pattern: /\b_rollDrive/, label: "_rollDrive*" },
    { pattern: /\b_cachedRollBaseConfig\b/, label: "_cachedRollBaseConfig" },
    { pattern: /\bgetKineticRollConfig\b/, label: "getKineticRollConfig", onlyUnder: "Libraries/" },
    { pattern: /\bgetKineticRollConfig\b/, label: "getKineticRollConfig", onlyUnder: "tests/" },
    { pattern: /\bpropIdToSlot\b/, label: "propIdToSlot", onlyUnder: "Libraries/" },
    { pattern: /\bactiveRunIds\b/, label: "activeRunIds", onlyUnder: "Libraries/" },
    { pattern: /\bgrabPropId\b/, label: "grabPropId", onlyUnder: "Libraries/" },
    { pattern: /\b_kineticBodies\b/, label: "_kineticBodies", onlyUnder: "Libraries/" },
    { pattern: /\b_activeKineticBodies\b/, label: "_activeKineticBodies", onlyUnder: "Libraries/" },
    { pattern: /\b_activeSlot\b/, label: "prop._activeSlot", onlyUnder: "Libraries/" },
    { pattern: /function applyGroundRollDrive[\s\S]{0,400}?entityRefs\s*\[/, label: "entityRefs in applyGroundRollDrive", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function applyRollBrake[\s\S]{0,200}?entityRefs\s*\[/, label: "entityRefs in applyRollBrake", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function applyRollThrust[\s\S]{0,300}?entityRefs\s*\[/, label: "entityRefs in applyRollThrust", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function resolveActiveBodyWalls[\s\S]{0,400}?entityRefs\s*\[/, label: "entityRefs in resolveActiveBodyWalls", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function kineticOverlapsWallCandidates[\s\S]{0,800}?entityRefs\s*\[/, label: "entityRefs in kineticOverlapsWallCandidates", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /export function integratePropMotion[\s\S]{0,400}?entityRefs\s*\[/, label: "entityRefs in integratePropMotion", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function applyKineticContactWake[\s\S]{0,400}?entityRefs\s*\[/, label: "entityRefs in applyKineticContactWake", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /export function entityContainsPointF32[\s\S]{0,400}?entityRefs\s*\[/, label: "entityRefs in entityContainsPointF32", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function resolveGrabDragAnchor[\s\S]{0,400}?entityRefs\s*\[/, label: "entityRefs in resolveGrabDragAnchor", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /function resolveGrabDragAnchor[\s\S]{0,3000}?propCatalogByRenderKeyId/, label: "catalog in resolveGrabDragAnchor", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /function resolveGrabDragAnchor[\s\S]{0,3000}?asset\.primitive/, label: "asset.primitive in resolveGrabDragAnchor", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /function resolveGrabDragAnchor[\s\S]{0,3000}?asset\.physics/, label: "asset.physics in resolveGrabDragAnchor", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /function resolveGrabDragAnchor[\s\S]{0,3000}?PROP_PRIMITIVE_/, label: "PROP_PRIMITIVE in resolveGrabDragAnchor", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /export function resolveDragInteractionBehavior[\s\S]{0,400}?propCatalogByRenderKeyId/, label: "catalog in resolveDragInteractionBehavior", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /export function assetSupportsDragInteraction[\s\S]{0,200}?isKinetic/, label: "isKinetic in assetSupportsDragInteraction", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /export function worldPropContainsPoint\b/, label: "deleted worldPropContainsPoint passthrough" },
    { pattern: /export function worldPropFootprintInto\b/, label: "deleted worldPropFootprintInto" },
    { pattern: /export function entityCollisionSpan\b/, label: "bag entityCollisionSpan", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /export function classifyKineticPairTier\s*\(/, label: "bag classifyKineticPairTier", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /export function checkEntityPairCollision\b/, label: "bag checkEntityPairCollision", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /if \(kind === DRAW_KIND_PROP\) this\._drawProp\(ctx, entityRefs/, label: "entityRefs in draw3DBuildings prop dispatch", onlyFile: "Libraries/Render/render.js" },
    { pattern: /_drawProp\s*\(\s*ctx\s*,\s*prop\b/, label: "bag-arg _drawProp", onlyFile: "Libraries/Render/render.js" },
    { pattern: /_drawProp\s*\([^)]*\)\s*\{[^}]*entityRefs\s*\[/, label: "entityRefs in _drawProp body", onlyFile: "Libraries/Render/render.js" },
    { pattern: /export function drawCachedPropSprite\s*\(\s*ctx\s*,\s*(?!eid\b)[a-zA-Z_]/, label: "bag-arg drawCachedPropSprite", onlyFile: "Libraries/Canvas/canvas.js" },
    { pattern: /export function getPropStaticKey\s*\(\s*(?!eid\b)[a-zA-Z_]/, label: "bag-arg getPropStaticKey", onlyFile: "Libraries/Canvas/canvas.js" },
    { pattern: /export function getPropStageBakeState\s*\(\s*(?!eid\b)[a-zA-Z_]/, label: "bag-arg getPropStageBakeState", onlyFile: "Libraries/Props/props.js" },
    { pattern: /\bconstraintBodyAt\b/, label: "constraintBodyAt", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /getWallCandidates\s*\(\s*(?!eid\b)[a-zA-Z_]/, label: "bag getWallCandidates", onlyUnder: "Libraries/" },
    { pattern: /\b_wallCandidatesNearWorld\b/, label: "_wallCandidatesNearWorld", onlyUnder: "Libraries/" },
    { pattern: /\bneedsWallCollision\b/, label: "needsWallCollision", onlyUnder: "Libraries/" },
    { pattern: /\bupdatePropSubstep\b/, label: "updatePropSubstep", onlyUnder: "Libraries/" },
    { pattern: /\bupdatePropSubstep\b/, label: "updatePropSubstep", onlyFile: "Apps/Editor/engine.js" },
    { pattern: /function snapshotKineticBodySlab[\s\S]{0,500}?\w+\[\w+\]\._physId/, label: "bag ._physId in snapshotKineticBodySlab", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function refreshActiveKineticBodySlabPose\s*\(\s*[^)\s]/, label: "bag-arg refreshActiveKineticBodySlabPose", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /\bgetLive\s*\(/, label: "getLive in dragBehaviors", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /\bgetRef\s*\(/, label: "getRef in dragBehaviors", onlyFile: "Libraries/Sandbox/dragBehaviors.js" },
    { pattern: /export function pairContactKey\b/, label: "bag pairContactKey", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /export function contactWarmStartKey\s*\(/, label: "bag contactWarmStartKey", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /export function areKineticLinkNeighbors\s*\(/, label: "bag areKineticLinkNeighbors", onlyFile: "Libraries/Physics/physics.js" },
    { pattern: /function forEachActivePropRunSlot[\s\S]{0,1200}?getLive\s*\(/, label: "getLive in forEachActivePropRunSlot", onlyFile: "Libraries/Sandbox/sandbox.js" },
    { pattern: /Libraries\/Entity\//, label: "Libraries/Entity/" },
    { pattern: /\bboundsF32\b/, label: "boundsF32" },
    { pattern: /\bcircleInBoundsF32\b/, label: "circleInBoundsF32" },
    { pattern: /return \{ buf:/, label: "return { buf:", onlyUnder: "Libraries/Viewport/" },
    { pattern: /\bscreenToWorld\(/, label: "screenToWorld(", onlyFile: "Libraries/Viewport/Viewport.js" },
    { pattern: /\bworldToScreen\(/, label: "worldToScreen(", onlyFile: "Libraries/Viewport/Viewport.js" },
    { pattern: /\bworldToScreenInto\b/, label: "worldToScreenInto", onlyFile: "Libraries/Viewport/Viewport.js" },
    { pattern: /export\s+class\s+ViewBounds\b/, label: "export class ViewBounds" },
    { pattern: /VIEW_TIER\s*=\s*Object\.freeze/, label: "VIEW_TIER = Object.freeze" },
];

export const LEGACY_SANDBOX_DRAG_PATTERNS = [
    { pattern: /\bresolveSandboxBehaviors\b/, label: "resolveSandboxBehaviors" },
    { pattern: /\bsetBehaviorOverrides\b/, label: "setBehaviorOverrides" },
    { pattern: /\bgetBehaviorOverrides\b/, label: "getBehaviorOverrides" },
    { pattern: /behaviors:\s*\[/, label: "sandbox.behaviors array in asset" },
];

export function rel(root, filePath) {
    return path.relative(root, filePath).replace(/\\/g, "/");
}

export function walk(dir, pred) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".cursor") continue;
            out.push(...walk(p, pred));
        } else if (pred(p)) out.push(p);
    }
    return out;
}

export function collectJsFiles(root, pathFilter = null) {
    const all = walk(root, (p) => p.endsWith(".js") && !p.includes("node_modules"));
    if (!pathFilter) return all;
    const normalized = pathFilter.replace(/\\/g, "/").replace(/\/$/, "");
    return all.filter((file) => {
        const r = rel(root, file);
        return r === normalized || r.startsWith(`${normalized}/`);
    });
}

export function isTestFile(relPath) {
    return relPath.replace(/\\/g, "/").includes("/tests/");
}

export function isProdConsumer(relPath) {
    if (isTestFile(relPath)) return false;
    const prodRoots = ["Apps", "Assets", "GameState", "Libraries", "Config", "Core"];
    return prodRoots.some((r) => relPath.startsWith(`${r}/`) || relPath === r);
}

export function issue(ruleId, severity, file, message, line = null) {
    return { ruleId, severity, file, message, line };
}

const exportRe = /^export (?:async )?(?:function|const|class) (\w+)/gm;
const importNamedRe = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
const importDefaultRe = /import\s+(\w+)\s+from\s*["']([^"']+)["']/g;
const forTestsNameRe = /ForTests?$/;
const mockFnRe = /^function (mock\w+|createMock\w*)\s*\(/gm;

export function libraryExports(root, files) {
    const map = new Map();
    for (const file of files) {
        const relPath = rel(root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const src = fs.readFileSync(file, "utf8");
        exportRe.lastIndex = 0;
        let m;
        while ((m = exportRe.exec(src))) {
            const list = map.get(m[1]) ?? [];
            list.push(relPath);
            map.set(m[1], list);
        }
    }
    return map;
}

export function collectImports(root, files) {
    const records = [];
    for (const file of files) {
        const relPath = rel(root, file);
        const src = fs.readFileSync(file, "utf8");
        importNamedRe.lastIndex = 0;
        let m;
        while ((m = importNamedRe.exec(src))) {
            for (const part of m[1].split(",")) {
                const name = part
                    .trim()
                    .split(/\s+as\s+/)[0]
                    .trim();
                if (name) records.push({ name, from: m[2], file: relPath, default: false });
            }
        }
        importDefaultRe.lastIndex = 0;
        while ((m = importDefaultRe.exec(src))) {
            records.push({ name: m[1], from: m[2], file: relPath, default: true });
        }
    }
    return records;
}

export function importsLibrary(from) {
    return from.includes("/Libraries/") || from.startsWith("../Libraries/") || from.startsWith("../../Libraries/");
}

export function scanTestLeaks(root, files) {
    const libFiles = files.filter((f) => rel(root, f).startsWith("Libraries/"));
    const exports = libraryExports(root, libFiles);
    const importRecords = collectImports(root, files).filter((r) => importsLibrary(r.from));
    const forbidden = [];
    const leaks = [];
    for (const [symbol, defFiles] of exports) {
        if (forTestsNameRe.test(symbol)) {
            forbidden.push({ symbol, defFiles });
            continue;
        }
        const users = importRecords.filter((r) => !r.default && r.name === symbol);
        if (users.length === 0) continue;
        const testUsers = users.filter((u) => isTestFile(u.file));
        const prodUsers = users.filter((u) => isProdConsumer(u.file));
        if (testUsers.length > 0 && prodUsers.length === 0) {
            leaks.push({ symbol, defFiles, testUsers: [...new Set(testUsers.map((u) => u.file))] });
        }
    }
    return { forbidden, leaks };
}

export function scanInlineTestMocks(root, files) {
    const mocks = [];
    for (const file of files) {
        const relPath = rel(root, file);
        if (!relPath.endsWith(".test.js") || !isTestFile(relPath)) continue;
        const src = fs.readFileSync(file, "utf8");
        mockFnRe.lastIndex = 0;
        let m;
        while ((m = mockFnRe.exec(src))) mocks.push({ file: relPath, fn: m[1] });
    }
    return mocks;
}
