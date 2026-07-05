import { getSandboxEntityMeta, resolveSandboxEntityLinkValue } from "../../GameState/sandboxEntityMeta.js";
import {
    FLOOR_CELL_KIND,
    FloorBelt,
    migrateMapGenBoundsForMode,
    syncMapGenBoundsFromPlay,
    cellIsStaticWall,
    railWallEdgeAt,
    getRailWallInfo,
    cellInRect,
    getVoxelWallInfo,
    applyFloorCellEdit,
    isCanonicalEdgeRepresentativeIdx,
    commitGridNavEdit,
    GRID_NAV_EPOCH,
    bumpGridNavEpoch,
    applyStampedGridWallsFromSnapshot,
    clearAllStampedGridWalls,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
    clearFloorCellNavEdit,
    unionCellBounds,
    clearRailWallAt,
    clearVoxelWallAt,
    ensureObstacleGridAtWorld,
    hitTestRailWallEdgeAtWorld,
    stampRailWallAt,
    setVoxelWallHeightAt,
    stampVoxelWallAt,
    floorOccupancyStampDrawCacheKey,
    computeCircleAimLineSegment,
    estimateRollingTravelDistance,
    appendGridEdgeOverlayCommand,
} from "../Spatial/spatial.js";
import {
    visitLiveWorldProps,
    addWorldPropToState,
    removeWorldPropFromState,
    findLiveWorldProp,
    addWorldPropsToState,
} from "../../GameState/EntityRegistry.js";
import {
    isKinematicallyActive,
    applyKineticConstraintsFromSnapshot,
    clearKineticConstraints,
    collectKineticConstraintsSnapshot,
    getKineticRollConfig,
    clearGroundRollDrive,
    decelerateRoll,
    steerRollToward,
    snapMoveTargetToCellCenter,
    addDistanceConstraint,
    listKineticConstraints,
    removeKineticConstraint,
    getConnectedComponentPath,
    getConnectedBodyIds,
    wakeKineticBody,
    distanceBetweenAnchors,
    worldAnchorFromBody,
    invalidateBroadphaseBounds,
    kineticMassFromFootprint,
    syncKineticRigidBody,
    kineticDynamicSlab,
    KINETIC_PAIR_TIER,
    IDENTITY_ROLL_QUAT,
    massFromBody,
    resolveBodyRadius,
    PolygonShape,
    physicsSettings,
} from "../Physics/physics.js";
import { gridSettings } from "../../Config/world.js";
import { appendActionRow, appendEditorHint, appendSelectField } from "../UI/paramFields.js";
import { setFormFieldName } from "../UI/Component.js";
import { SliderControl } from "../UI/controls/SliderControl.js";
import { shippedSurfaceProfileIds } from "../../Config/procedural/profiles.js";
import { WorldProp } from "../../Entities/WorldProp.js";
import {
    applyPropBoxFootprint,
    findGridAnchoredFloorPropAtIdx,
    setPropRadius,
    applyCrossPinwheelFootprint,
    formatPropTypeLabel,
} from "../Props/props.js";
import { convexFootprintHalfExtents, emptyAabb, growAabbFromCenterInto, isEmptyAabb, normalizeXY, createAabb, centeredAabbInto, quantizeAngleIndex } from "../Math/math.js";
import { applyCueStrikeCollision } from "../CueStick/cueStrikeCollision.js";
import { buildCueStrikeAimLineContext, getCueStrikeAimLine, resolveCueStrikeMaxRayDist } from "../CueStick/cueStrikeAimPreview.js";
import { FLIPPER_LAYOUT } from "../../Assets/props/flipper/flipperShared.js";
import { agentPose } from "../Agent/index.js";
import { sampleFlowDirectionInto, buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay, HpaNavSession, snapNavGoalWorldInto, navHasPath, REPLAN_PRIORITY_TARGET } from "../Navigation/navigation.js";
import {
    appendOverlayWireLink,
    overlayAimSegment,
    overlayCircleFillStroke,
    overlayCircleStroke,
    overlaySegment,
    overlayCachedSelectionRing,
    overlayGridCellHighlight,
    overlayAabb,
    overlayCachedWireEndpoint,
    createConveyorDraw,
    queryPropsInView,
} from "../Render/render.js";
import { GRID_STAMP_RENDER_KEY, drawCachedPropSprite } from "../Canvas/canvas.js";
import { serializeVisualOverride, stampPropVisualOverride, sampleAssetBaseTintHex, setPropVisualBrightness, setPropVisualTint } from "../Color/visualOverride.js";
import { unregisterPropFromCategoryIndexes } from "../../GameState/SandboxWorldState.js";
import propCatalog from "../../Assets/props/index.js";
// --- MERGED FROM sandboxBehaviorConfig.js ---
/** @param {object} state @param {object | null | undefined} prop @param {object | null | undefined} asset @param {"cueStrike"} behaviorKey */
export function resolveWorldPropSandboxBehavior(state, prop, asset, behaviorKey) {
    const stamped = getSandboxEntityMeta(state).getBehaviorOverrides(prop?.id)?.[behaviorKey];
    return stamped && typeof stamped === "object" ? stamped : {};
}
/** @param {object} state @param {object | null | undefined} prop @param {object | null | undefined} asset @param {string} behaviorId */
export function resolveWorldPropInputGateRules(state, prop, asset, behaviorId) {
    const stamped = getSandboxEntityMeta(state).getBehaviorOverrides(prop?.id)?.inputGates?.[behaviorId];
    return Array.isArray(stamped) ? stamped : [];
}
// --- MERGED FROM sandboxCapabilities.js ---
export const DIRECT_GROUND_NAV_BEHAVIOR_ID = "rollToCursorDirect";
export const FLOW_GROUND_NAV_BEHAVIOR_ID = "rollToCursorFlow";
export const HPA_GROUND_NAV_BEHAVIOR_ID = "rollToCursorHpa";
export const GROUND_NAV_BEHAVIOR_IDS = new Set([DIRECT_GROUND_NAV_BEHAVIOR_ID, FLOW_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID]);
export const SANDBOX_BEHAVIOR_LABELS = {
    dragLaunch: "Drag launch",
    dragLaunchWait: "Drag launch (wait for rest)",
    dragLaunchFacing: "Drag launch (yaw to shot)",
    spawner: "Spawner",
    flipper: "Flipper",
    cueStrike: "Cue strike",
    [DIRECT_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (direct)",
    [HPA_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (HPA)",
    [FLOW_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (flow)",
};
export function getSandboxBehaviorLabel(behaviorId) {
    return SANDBOX_BEHAVIOR_LABELS[behaviorId] ?? behaviorId;
}
export function isSandboxSpawnable(asset) {
    const sandbox = asset?.sandbox;
    if (sandbox == null || typeof sandbox !== "object") return false;
    return sandbox.spawnable !== false;
}
export function sandboxAssetTags(asset) {
    const tags = asset?.sandbox?.tags;
    if (!Array.isArray(tags)) return [];
    return tags.filter((tag) => typeof tag === "string");
}
export function sandboxTagsMatchFilter(filter, tags) {
    if (filter === "all") return true;
    return tags.includes(filter);
}
export function sandboxAssetMatchesTagFilter(asset, filter) {
    return sandboxTagsMatchFilter(filter, sandboxAssetTags(asset));
}
export function isGridFloorBeltSpawnAsset(asset) {
    return asset?.sandbox?.gridFloorBelt === true;
}
export function isPoolRackSpawnAsset(asset) {
    return asset?.sandbox?.spawnRack === "8ball" || asset?.sandbox?.spawnRack === "9ball";
}
export const DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH = 16;
export const DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT = 16;
export function isResizableBoxSpawnAsset(asset) {
    return Boolean(asset?.sandbox?.resizableBox);
}
export function isSingleWorldPropSpawnAsset(asset) {
    return Boolean(asset) && !isGridFloorBeltSpawnAsset(asset) && !isPoolRackSpawnAsset(asset);
}
export function resolveFloorBeltKindFromSpawnAsset(asset) {
    const kind = asset?.sandbox?.floorBeltKind;
    if (kind === "elbowLeft") return FLOOR_CELL_KIND.BeltElbowLeft;
    if (kind === "elbowRight") return FLOOR_CELL_KIND.BeltElbowRight;
    return FLOOR_CELL_KIND.Belt;
}
export function listFloorBeltKindOptions() {
    const FLOOR_BELT_KINDS = [FLOOR_CELL_KIND.Belt, FLOOR_CELL_KIND.BeltElbowLeft, FLOOR_CELL_KIND.BeltElbowRight];
    return FLOOR_BELT_KINDS.map((kind) => ({ kind, label: FloorBelt.formatKindLabel(kind) }));
}
export function resolveSandboxBehaviors(asset, state, prop = null) {
    const behaviors = state.sandbox?.behaviors ?? [];
    const byId = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    const behaviorOverrides = prop ? getSandboxEntityMeta(state).getBehaviorOverrides(prop.id) : null;
    if (behaviorOverrides) {
        const stamped = [];
        for (const key of Object.keys(behaviorOverrides)) {
            if (key === "inputGates") continue;
            if (byId.has(key)) stamped.push(key);
        }
        if (stamped.length) return stamped;
    }
    if (Array.isArray(asset?.sandbox?.behaviors)) return asset.sandbox.behaviors.filter((id) => byId.has(id));
    const sandbox = asset?.sandbox;
    return [...byId.values()]
        .filter((behavior) => {
            if (behavior.supports && asset && !behavior.supports(prop, asset)) return false;
            if (GROUND_NAV_BEHAVIOR_IDS.has(behavior.id) && sandbox?.groundNav === false) return false;
            return true;
        })
        .map((behavior) => behavior.id);
}
// --- MERGED FROM sandboxFaction.js ---
export const sandboxFactions = { alpha: "alpha", bravo: "bravo", charlie: "charlie", delta: "delta", echo: "echo" };
export const SANDBOX_DEFAULT_FACTION = sandboxFactions.alpha;
export const SANDBOX_FACTION_OPTIONS = [
    { id: sandboxFactions.alpha, label: "Alpha" },
    { id: sandboxFactions.bravo, label: "Bravo" },
    { id: sandboxFactions.charlie, label: "Charlie" },
    { id: sandboxFactions.delta, label: "Delta" },
    { id: sandboxFactions.echo, label: "Echo" },
];
export function formatSandboxFactionLabel(factionId) {
    return SANDBOX_FACTION_OPTIONS.find((opt) => opt.id === factionId)?.label ?? factionId;
}
export function resolveSandboxFaction(actor) {
    return actor?.faction ?? SANDBOX_DEFAULT_FACTION;
}
// --- MERGED FROM inputGates.js ---
/**
 * @typedef {"self" | "groupWorldProps" | "groupKinetic"} InputGateScope
 * @typedef {"atRest" | "asleep" | "allAtRest" | "allAsleep"} InputGateUntil
 * @typedef {{
 *   scope: InputGateScope,
 *   until: InputGateUntil,
 *   link?: string,
 *   excludeStates?: string[],
 * }} InputGateRule
 * @typedef {{ allowed: boolean, failedRule?: InputGateRule }} InputGateResult
 */
/** @param {object} entity */
export function isEntityAtRest(entity) {
    if (!entity || entity.isDead) return true;
    return !isKinematicallyActive(entity);
}
/** @param {object} entity */
export function isEntityAsleep(entity) {
    if (!entity || entity.isDead) return true;
    return Boolean(entity.isSleeping);
}
/** @param {object} entity @param {InputGateUntil} until */
function entityPassesUntil(entity, until) {
    if (until === "atRest" || until === "allAtRest") return isEntityAtRest(entity);
    return isEntityAsleep(entity);
}
/** @param {object} entity @param {string[] | undefined} excludeStates */
function isExcludedFromGate(entity, excludeStates) {
    if (!excludeStates?.length) return false;
    const state = entity.currentStateName;
    return state != null && excludeStates.includes(state);
}
export function resolveInputGateScope(scope, prop, state, linkField) {
    if (scope === "self") return [prop];
    const linkValue = linkField ? resolveSandboxEntityLinkValue(state, prop, linkField) : undefined;
    if (linkValue == null) return [];
    const members = [];
    visitLiveWorldProps(state.worldProps, (entity) => {
        if (resolveSandboxEntityLinkValue(state, entity, linkField) !== linkValue) return;
        if (scope === "groupKinetic" && !entity.strategy?.isKinetic) return;
        members.push(entity);
    });
    return members;
}
/** @param {object[]} entities @param {InputGateUntil} until @param {string[] | undefined} excludeStates */
function scopePassesUntil(entities, until, excludeStates) {
    const aggregate = until === "allAtRest" || until === "allAsleep";
    const predicate = aggregate ? (until === "allAtRest" ? "atRest" : "asleep") : until;
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (isExcludedFromGate(entity, excludeStates)) continue;
        if (!entityPassesUntil(entity, predicate)) return false;
    }
    return true;
}
export function evaluateInputGateRule(rule, prop, state) {
    const entities = resolveInputGateScope(rule.scope, prop, state, rule.link);
    if (entities.length === 0) return true;
    return scopePassesUntil(entities, rule.until, rule.excludeStates);
}
/**
 * @param {string} behaviorId
 * @param {object} prop
 * @param {object | null | undefined} asset
 * @param {object} state
 */
export function evaluateInputGates(behaviorId, prop, asset, state) {
    const rules = resolveWorldPropInputGateRules(state, prop, asset, behaviorId);
    if (rules.length === 0) return { allowed: true };
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (!evaluateInputGateRule(rule, prop, state)) return { allowed: false, failedRule: rule };
    }
    return { allowed: true };
}
// --- MERGED FROM mapGenInspector.js ---
const BOUNDS_SHAPE_OPTIONS = [
    { value: "rect", label: "Rectangle" },
    { value: "circle", label: "Circle" },
    { value: "donut", label: "Donut" },
];
const mapGenBoundInputs = [];
export function refreshMapGenPanelInputs() {
    for (let i = 0; i < mapGenBoundInputs.length; i++) mapGenBoundInputs[i].input.value = String(mapGenBoundInputs[i].getValue());
}
function appendSyncedNumberField(panel, label, getValue, setValue, onPreviewChange, options) {
    const { step = 1, min = -999999 } = options ?? {};
    const field = document.createElement("label");
    field.className = "param-field";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    setFormFieldName(input, label);
    input.step = String(step);
    input.min = String(min);
    input.value = String(getValue());
    field.append(labelSpan, input);
    panel.appendChild(field);
    input.addEventListener("change", () => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
            input.value = String(getValue());
            return;
        }
        setValue(parsed);
        input.value = String(getValue());
        onPreviewChange();
    });
    mapGenBoundInputs.push({ input, getValue });
}
function appendMapGenBoundsControls(panel, config, state, overlayHint, onPreviewChange) {
    const { playConfig } = state.editor;
    appendEditorHint(panel, overlayHint);
    const rectFields = document.createElement("div");
    const circleFields = document.createElement("div");
    const donutFields = document.createElement("div");
    const updateModeVisibility = () => {
        rectFields.hidden = config.boundsMode !== "rect";
        circleFields.hidden = config.boundsMode === "rect";
        donutFields.hidden = config.boundsMode !== "donut";
    };
    appendSelectField(panel, "Bounds shape", {
        value: config.boundsMode,
        options: BOUNDS_SHAPE_OPTIONS,
        onChange: (value) => {
            config.boundsMode = value;
            migrateMapGenBoundsForMode(state.obstacleGrid, config);
            refreshMapGenPanelInputs();
            updateModeVisibility();
            onPreviewChange();
        },
    });
    appendActionRow(
        panel,
        [
            {
                label: "Center bounds on camera",
                onClick: () => {
                    syncMapGenBoundsFromPlay(state.obstacleGrid, state.viewport, playConfig, config, gridSettings.cellSize);
                    migrateMapGenBoundsForMode(state.obstacleGrid, config);
                    refreshMapGenPanelInputs();
                    onPreviewChange();
                },
            },
        ],
        { className: "editor-tools-row" },
    );
    const setBound = (setter) => (v) => {
        setter(v);
        migrateMapGenBoundsForMode(state.obstacleGrid, config);
    };
    const addBound = (parent, label, get, set, opts) => appendSyncedNumberField(parent, label, get, setBound(set), onPreviewChange, opts);
    addBound(
        rectFields,
        "Bounds col",
        () => config.boundsIdx % state.obstacleGrid.cols,
        (v) => {
            const r = (config.boundsIdx / state.obstacleGrid.cols) | 0;
            config.boundsIdx = state.obstacleGrid.idx(Math.round(v), r);
        },
    );
    addBound(
        rectFields,
        "Bounds row",
        () => (config.boundsIdx / state.obstacleGrid.cols) | 0,
        (v) => {
            const c = config.boundsIdx % state.obstacleGrid.cols;
            config.boundsIdx = state.obstacleGrid.idx(c, Math.round(v));
        },
    );
    addBound(
        rectFields,
        "Bounds cols",
        () => config.boundsCols,
        (v) => {
            config.boundsCols = Math.max(1, Math.round(v));
        },
        { min: 1 },
    );
    addBound(
        rectFields,
        "Bounds rows",
        () => config.boundsRows,
        (v) => {
            config.boundsRows = Math.max(1, Math.round(v));
        },
        { min: 1 },
    );
    addBound(
        circleFields,
        "Center col",
        () => config.centerIdx % state.obstacleGrid.cols,
        (v) => {
            const r = (config.centerIdx / state.obstacleGrid.cols) | 0;
            config.centerIdx = state.obstacleGrid.idx(Math.round(v), r);
        },
    );
    addBound(
        circleFields,
        "Center row",
        () => (config.centerIdx / state.obstacleGrid.cols) | 0,
        (v) => {
            const c = config.centerIdx % state.obstacleGrid.cols;
            config.centerIdx = state.obstacleGrid.idx(c, Math.round(v));
        },
    );
    addBound(
        circleFields,
        "Radius (cells)",
        () => config.outerRadiusCells,
        (v) => {
            config.outerRadiusCells = Math.max(1, Math.round(v));
        },
        { min: 1 },
    );
    appendSyncedNumberField(
        donutFields,
        "Donut thickness (cells)",
        () => config.donutThicknessCells,
        (v) => {
            config.donutThicknessCells = Math.max(1, Math.min(config.outerRadiusCells - 1, Math.round(v)));
        },
        onPreviewChange,
        { min: 1 },
    );
    panel.append(rectFields, circleFields, donutFields);
    updateModeVisibility();
}
function appendMapGenRockSliders(panel, config, maxWallHeightLevel) {
    const addSlider = (label, min, max, step, key, format = (v) => String(v)) => {
        panel.appendChild(
            new SliderControl(
                label,
                min,
                max,
                step,
                config[key],
                (val) => {
                    config[key] = val;
                },
                format,
            ).element,
        );
    };
    addSlider("Rock density", 0.2, 0.7, 0.05, "fillChance", (v) => `${Math.round(v * 100)}%`);
    addSlider("Smooth passes", 1, 8, 1, "iterations");
    addSlider("Wall height", 1, maxWallHeightLevel, 1, "wallHeightLevel");
}
function buildCavernGenEditor(panel, state, onPreviewChange, onGenerated, generateCaverns) {
    mapGenBoundInputs.length = 0;
    const { cavernConfig } = state.editor;
    const maxWallHeightLevel = state.worldSurfaces.settings.maxWallHeightLevel;
    appendMapGenBoundsControls(panel, cavernConfig, state, "Orange overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const profileOptions = shippedSurfaceProfileIds().map((id) => ({ value: id, label: id }));
    appendSelectField(panel, "Surface profile", {
        value: cavernConfig.surfaceProfileId,
        options: profileOptions,
        onChange: (value) => {
            cavernConfig.surfaceProfileId = value;
            onPreviewChange();
        },
    });
    appendMapGenRockSliders(panel, cavernConfig, maxWallHeightLevel);
    const seedLine = document.createElement("p");
    seedLine.className = "editor-hint";
    seedLine.textContent = `Seed ${state.mapSeed}`;
    panel.appendChild(seedLine);
    appendActionRow(
        panel,
        [
            {
                label: "New seed",
                onClick: () => {
                    state.mapSeed = Math.floor(1 + Math.random() * 1_000_000_000);
                    seedLine.textContent = `Seed ${state.mapSeed}`;
                },
            },
            {
                label: "Generate caverns",
                variant: "",
                onClick: () => {
                    void generateCaverns().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
function buildRailGenEditor(panel, state, onPreviewChange, onGenerated, generateRails) {
    mapGenBoundInputs.length = 0;
    const { railConfig } = state.editor;
    const maxWallHeightLevel = state.worldSurfaces.settings.maxWallHeightLevel;
    appendMapGenBoundsControls(panel, railConfig, state, "Purple overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const profileOptions = shippedSurfaceProfileIds().map((id) => ({ value: id, label: id }));
    appendSelectField(panel, "Surface profile", {
        value: railConfig.surfaceProfileId,
        options: profileOptions,
        onChange: (value) => {
            railConfig.surfaceProfileId = value;
            onPreviewChange();
        },
    });
    appendMapGenRockSliders(panel, railConfig, maxWallHeightLevel);
    panel.appendChild(
        new SliderControl("Wall thickness", 1, 4, 1, railConfig.edgeThickness, (val) => {
            railConfig.edgeThickness = val;
        }).element,
    );
    appendActionRow(
        panel,
        [
            {
                label: "Generate rail walls",
                variant: "",
                onClick: () => {
                    void generateRails().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
function buildRailMazeGenEditor(panel, state, onPreviewChange, onGenerated, generateRailMaze) {
    mapGenBoundInputs.length = 0;
    const { railMazeConfig } = state.editor;
    const maxWallHeightLevel = state.worldSurfaces.settings.maxWallHeightLevel;
    appendMapGenBoundsControls(panel, railMazeConfig, state, "Light purple overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const profileOptions = shippedSurfaceProfileIds().map((id) => ({ value: id, label: id }));
    appendSelectField(panel, "Surface profile", {
        value: railMazeConfig.surfaceProfileId,
        options: profileOptions,
        onChange: (value) => {
            railMazeConfig.surfaceProfileId = value;
            onPreviewChange();
        },
    });
    panel.appendChild(
        new SliderControl("Wall thickness", 1, 4, 1, railMazeConfig.edgeThickness, (val) => {
            railMazeConfig.edgeThickness = val;
        }).element,
    );
    panel.appendChild(
        new SliderControl("Wall height", 1, maxWallHeightLevel, 1, railMazeConfig.wallHeightLevel, (val) => {
            railMazeConfig.wallHeightLevel = val;
        }).element,
    );
    panel.appendChild(
        new SliderControl("Min corridor width", 1, 4, 1, railMazeConfig.corridorWidthMin, (val) => {
            railMazeConfig.corridorWidthMin = val;
            if (railMazeConfig.corridorWidthMax < val) railMazeConfig.corridorWidthMax = val;
        }).element,
    );
    panel.appendChild(
        new SliderControl("Max corridor width", 1, 4, 1, railMazeConfig.corridorWidthMax, (val) => {
            railMazeConfig.corridorWidthMax = Math.max(railMazeConfig.corridorWidthMin, val);
        }).element,
    );
    panel.appendChild(
        new SliderControl(
            "Extra link ratio",
            0,
            1,
            0.05,
            railMazeConfig.extraLinkRatio,
            (val) => {
                railMazeConfig.extraLinkRatio = val;
            },
            (v) => `${Math.round(v * 100)}%`,
        ).element,
    );
    appendActionRow(
        panel,
        [
            {
                label: "Generate rail maze",
                variant: "",
                onClick: () => {
                    void generateRailMaze().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
function buildEraseEditor(panel, state, onPreviewChange, onGenerated, eraseWalls) {
    mapGenBoundInputs.length = 0;
    const { eraseConfig } = state.editor;
    appendMapGenBoundsControls(
        panel,
        eraseConfig,
        state,
        "Red overlay on map overview — drag inside to move, drag edges/rings to resize. Clears voxel walls and rail edges in bounds.",
        onPreviewChange,
    );
    appendActionRow(
        panel,
        [
            {
                label: "Erase walls in bounds",
                variant: "",
                onClick: () => {
                    void eraseWalls().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
export function appendMapGenEditor(parent, state, kind, { onGenerated, onPreviewChange, generateCaverns, generateRails, generateRailMaze, eraseWalls }) {
    if (kind === "cavern") buildCavernGenEditor(parent, state, onPreviewChange, onGenerated, generateCaverns);
    else if (kind === "rail") buildRailGenEditor(parent, state, onPreviewChange, onGenerated, generateRails);
    else if (kind === "railMaze") buildRailMazeGenEditor(parent, state, onPreviewChange, onGenerated, generateRailMaze);
    else buildEraseEditor(parent, state, onPreviewChange, onGenerated, eraseWalls);
}
// --- MERGED FROM sandboxPlacedSpawn.js ---
function assetDefaultFootprintSpan(typeId) {
    const footprint = propCatalog[typeId]?.physics?.localFootprint;
    if (!footprint?.length) return null;
    return convexFootprintHalfExtents(footprint);
}
function footprintDiffersFromAsset(prop) {
    const defaultSpan = assetDefaultFootprintSpan(prop.type);
    if (!defaultSpan || prop.shape?.type !== "Polygon") return false;
    const span = convexFootprintHalfExtents(prop.shape.vertices);
    return span.x !== defaultSpan.x || span.y !== defaultSpan.y;
}
function serializePlacedProp(prop) {
    const entry = { type: prop.type, x: prop.x, y: prop.y, facing: prop.facing, faction: resolveSandboxFaction(prop) };
    const assetRadius = propCatalog[prop.type]?.physics?.radius;
    if (prop.radius != null && assetRadius != null && prop.radius !== assetRadius) entry.radius = prop.radius;
    if (prop.type === "cross_pinwheel") {
        if (prop.crossLength !== undefined) entry.crossLength = prop.crossLength;
        if (prop.crossThickness !== undefined) entry.crossThickness = prop.crossThickness;
    } else if (footprintDiffersFromAsset(prop)) {
        const span = convexFootprintHalfExtents(prop.shape.vertices);
        entry.width = span.x * 2;
        entry.height = span.y * 2;
    }
    const visualOverride = serializeVisualOverride(prop);
    if (visualOverride) entry.visualOverride = visualOverride;
    return entry;
}
export function collectFlatPlacedSandboxPropEntries(state) {
    const props = [];
    const propIdToIndex = new Map();
    visitLiveWorldProps(state.worldProps, (prop) => {
        propIdToIndex.set(prop.id, props.length);
        props.push(serializePlacedProp(prop));
    });
    return { props, propIdToIndex };
}
function tryExportSpawnGroup(members, meta) {
    return tryExportPoolRackSpawnGroup(members, meta) ?? tryExportLinkedBallChainSpawnGroup(members, meta);
}
export function spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, faction = SANDBOX_DEFAULT_FACTION, facing = 0, boxHalfExtents = undefined, visualOverride = undefined) {
    const asset = propCatalog[propTypeId];
    if (!asset) throw new Error(`Unknown prop type: ${propTypeId}`);
    if (isGridFloorBeltSpawnAsset(asset)) throw new Error(`Grid floor belt "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    if (isPoolRackSpawnAsset(asset)) return spawnPoolRack(state, worldX, worldY, asset.sandbox.spawnRack, faction);
    const prop = new WorldProp(worldX, worldY, propTypeId, facing);
    if (boxHalfExtents) applyPropBoxFootprint(prop, boxHalfExtents.x, boxHalfExtents.y);
    prop.faction = faction;
    if (visualOverride != null) stampPropVisualOverride(prop, visualOverride);
    addWorldPropToState(state, prop);
    return prop;
}
export function removeSandboxWorldProp(state, prop, spatialFrame) {
    unregisterPropFromCategoryIndexes(state, prop);
    removeWorldPropFromState(state, prop, spatialFrame, getSandboxEntityMeta(state));
}
// --- MERGED FROM sandboxPlacementOrder.js ---
export function createSandboxPlacementOrder(state) {
    let nextPlacementSeq = 1;
    const placementSeqByKey = new Map();
    const propPlacementKey = (id) => `prop:${id}`;
    const floorPlacementKey = (idx) => `floor:${idx}`;
    const voxelPlacementKey = (idx) => `voxel:${idx}`;
    const edgePlacementKey = (kind, idx, side) => `${kind}:${idx},${side}`;
    const touch = (key) => {
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    return {
        propPlacementKey,
        floorPlacementKey,
        voxelPlacementKey,
        edgePlacementKey,
        touchPropPlacement(id) {
            touch(propPlacementKey(id));
        },
        touchFloorPlacement(idx) {
            touch(floorPlacementKey(idx));
        },
        touchVoxelPlacement(idx) {
            touch(voxelPlacementKey(idx));
        },
        touchEdgePlacement(kind, idx, side) {
            touch(edgePlacementKey(kind, idx, side));
        },
        forgetPropPlacement(id) {
            placementSeqByKey.delete(propPlacementKey(id));
        },
        forgetFloorPlacement(idx) {
            placementSeqByKey.delete(floorPlacementKey(idx));
        },
        forgetVoxelPlacement(idx) {
            placementSeqByKey.delete(voxelPlacementKey(idx));
        },
        forgetEdgePlacement(kind, idx, side) {
            placementSeqByKey.delete(edgePlacementKey(kind, idx, side));
        },
        resetPlacementOrder() {
            placementSeqByKey.clear();
            nextPlacementSeq = 1;
        },
        placementSeq(key, fallback) {
            return placementSeqByKey.get(key) ?? fallback;
        },
        listTrackedVoxelWalls() {
            const grid = state.obstacleGrid;
            const placed = [];
            for (const key of placementSeqByKey.keys()) {
                if (!key.startsWith("voxel:")) continue;
                const idx = Number(key.slice(6));
                if (!cellIsStaticWall(grid, idx)) continue;
                const heightLevel = grid.grid[idx];
                placed.push({ heightLevel, label: `Voxel · idx ${idx} · height ${heightLevel}`, idx });
            }
            placed.sort((a, b) => this.placementSeq(voxelPlacementKey(a.idx), 0) - this.placementSeq(voxelPlacementKey(b.idx), 0));
            return placed;
        },
        listTrackedRailWalls() {
            const grid = state.obstacleGrid;
            const placed = [];
            const prefix = "rail:";
            for (const key of placementSeqByKey.keys()) {
                if (!key.startsWith(prefix)) continue;
                const parts = key.slice(prefix.length).split(",");
                const idx = Number(parts[0]);
                const side = Number(parts[1]);
                if (!railWallEdgeAt(grid, idx, side)) continue;
                const info = getRailWallInfo(grid, idx, side);
                if (!info) continue;
                placed.push({ side, heightLevel: info.heightLevel, thicknessLevel: info.thicknessLevel, label: `Rail · idx ${idx} · ${info.sideLabel} · height ${info.heightLevel}`, idx });
            }
            placed.sort((a, b) => this.placementSeq(edgePlacementKey("rail", a.idx, a.side), 0) - this.placementSeq(edgePlacementKey("rail", b.idx, b.side), 0));
            return placed;
        },
    };
}
// --- MERGED FROM sandboxPropMeta.js ---
/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
export const SANDBOX_PATH_VISUAL_OFF = "off";
export const SANDBOX_PATH_VISUAL_NORMAL = "normal";
export const SANDBOX_PATH_VISUAL_DEBUG = "debug";
export const SANDBOX_PATH_VISUAL_OPTIONS = [SANDBOX_PATH_VISUAL_OFF, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_DEBUG];
export const SANDBOX_PATH_VISUAL_LABELS = { off: "Off", normal: "Normal", debug: "Debug" };
/** @param {object} state @param {object} prop @returns {SandboxPathVisual} */
export function resolveSandboxPathVisual(state, prop) {
    return getSandboxEntityMeta(state).getPathVisual(prop.id) ?? SANDBOX_PATH_VISUAL_NORMAL;
}
/** @param {object} state @param {object} prop @param {SandboxPathVisual} visual */
export function setSandboxPathVisual(state, prop, visual) {
    getSandboxEntityMeta(state).setPathVisual(prop.id, visual);
}
// --- MERGED FROM sandboxShapeFamilies.js ---
export const SANDBOX_PRIMARY_PROP_IDS = ["ball", "flipper_left", "flipper_right"];
export const DEFAULT_BALL_SPAWN_RADIUS = 4;
export function orderSandboxPalettePropIds(propIds) {
    const available = new Set(propIds);
    const ordered = [];
    for (let i = 0; i < SANDBOX_PRIMARY_PROP_IDS.length; i++) {
        const id = SANDBOX_PRIMARY_PROP_IDS[i];
        if (available.has(id)) ordered.push(id);
    }
    const rest = propIds.filter((id) => !SANDBOX_PRIMARY_PROP_IDS.includes(id)).sort((a, b) => a.localeCompare(b));
    return ordered.concat(rest);
}
export function isBallFamilyAsset(asset) {
    return asset?.primitive === "sphere" && isSingleWorldPropSpawnAsset(asset) && asset.physics?.isKinetic !== false;
}
export function isBlockFamilyAsset(asset) {
    return asset?.primitive === "polygon" && isSingleWorldPropSpawnAsset(asset) && asset.physics?.isKinetic !== false;
}
export function isShapeFamilyAsset(asset) {
    return isBallFamilyAsset(asset) || isBlockFamilyAsset(asset);
}
export function assetDefaultBallRadius(asset) {
    return asset?.physics?.radius ?? DEFAULT_BALL_SPAWN_RADIUS;
}
export function blockPresetUsesResizableFootprint(propId) {
    return isResizableBoxSpawnAsset(propCatalog[propId]);
}
// --- MERGED FROM sandboxSelection.js ---
export function createSandboxSelection({ isLiveProp }) {
    /** @type {SandboxSelection | null} */
    let selection = null;
    /** @param {SandboxSelection | null} next */
    const assign = (next) => {
        selection = next;
    };
    /** @param {SandboxSelectInput | null} input */
    const select = (input) => {
        if (input == null) {
            assign(null);
            return;
        }
        if (input.kind === "prop") {
            const ids = new Set();
            for (let i = 0; i < input.ids.length; i++) {
                const id = input.ids[i];
                if (isLiveProp(id)) ids.add(id);
            }
            assign(ids.size === 0 ? null : { kind: "prop", ids });
            return;
        }
        if (input.kind === "floor") {
            assign({ kind: "floor", idx: input.idx });
            return;
        }
        if (input.kind === "voxel") {
            assign({ kind: "voxel", idx: input.idx });
            return;
        }
        if (input.kind === "rail") {
            assign({ kind: "rail", idx: input.idx, side: input.side });
            return;
        }
    };
    const clearSelection = () => {
        assign(null);
    };
    const clearPropSelection = () => {
        if (selection?.kind === "prop") assign(null);
    };
    const clearFloorSelection = () => {
        if (selection?.kind === "floor") assign(null);
    };
    const clearWallSelection = () => {
        if (selection?.kind === "voxel" || selection?.kind === "rail") assign(null);
    };
    const prunePropSelection = () => {
        if (selection?.kind !== "prop") return false;
        let changed = false;
        for (const id of selection.ids)
            if (!isLiveProp(id)) {
                selection.ids.delete(id);
                changed = true;
            }
        if (!changed) return false;
        if (selection.ids.size === 0) assign(null);
        return true;
    };
    const removePropFromSelection = (propId) => {
        if (selection?.kind !== "prop" || !selection.ids.delete(propId)) return false;
        if (selection.ids.size === 0) assign(null);
        return true;
    };
    const togglePropInSelection = (propId) => {
        if (!isLiveProp(propId)) return false;
        if (selection?.kind === "prop") {
            if (selection.ids.has(propId)) selection.ids.delete(propId);
            else selection.ids.add(propId);
            if (selection.ids.size === 0) assign(null);
            return true;
        }
        assign({ kind: "prop", ids: new Set([propId]) });
        return true;
    };
    const dropDeletedWallSelection = (idx, side = null) => {
        if (selection?.kind === "voxel" && selection.idx === idx) {
            assign(null);
            return;
        }
        if (selection?.kind === "rail" && selection.idx === idx && (side == null || selection.side === side)) assign(null);
    };
    return {
        getSelection: () => selection,
        select,
        clearSelection,
        clearPropSelection,
        clearFloorSelection,
        clearWallSelection,
        prunePropSelection,
        removePropFromSelection,
        togglePropInSelection,
        dropDeletedWallSelection,
    };
}
/** @typedef {{ kind: 'prop', ids: Set<number> } | { kind: 'floor', idx: number } | { kind: 'voxel', idx: number } | { kind: 'rail', idx: number, side: number }} SandboxSelection */
/** @typedef {{ kind: 'prop', ids: number[] } | { kind: 'floor', idx: number } | { kind: 'voxel', idx: number } | { kind: 'rail', idx: number, side: number }} SandboxSelectInput */
// --- MERGED FROM sandboxSelectionInspectors.js ---
export function selectionFloorCell(sel) {
    return sel?.kind === "floor" ? { idx: sel.idx } : null;
}
export function selectionVoxelCell(sel) {
    return sel?.kind === "voxel" ? { idx: sel.idx } : null;
}
export function selectionRailEdge(sel) {
    return sel?.kind === "rail" ? { idx: sel.idx, side: sel.side } : null;
}
export function selectionPropIds(sel) {
    return sel?.kind === "prop" ? [...sel.ids] : [];
}
export function selectionPrimaryPropId(sel, isLiveProp) {
    if (sel?.kind !== "prop") return null;
    for (const id of sel.ids) if (isLiveProp(id)) return id;
    return null;
}
export function buildFloorBeltInspectorInfo(state, sel) {
    const cell = selectionFloorCell(sel);
    if (!cell) return null;
    const grid = state.obstacleGrid;
    const { idx } = cell;
    if (!cellInRect(idx, grid.cols, grid.rows)) return null;
    if (!(grid.floorKind[idx] !== 0)) return null;
    const kind = grid.floorKind[idx];
    const facingIndex = grid.floorFacing[idx];
    return { idx, kind, facingIndex, kindLabel: FloorBelt.formatKindLabel(kind), facingLabel: FloorBelt.formatFacingLabel(facingIndex) };
}
export function buildVoxelWallInspectorInfo(state, sel) {
    const cell = selectionVoxelCell(sel);
    if (!cell) return null;
    const grid = state.obstacleGrid;
    const idx = cell.idx;
    const info = getVoxelWallInfo(grid, idx);
    if (info == null) return null;
    return { idx, heightLevel: grid.grid[idx] };
}
export function buildRailWallInspectorInfo(state, sel) {
    const edge = selectionRailEdge(sel);
    if (!edge) return null;
    const grid = state.obstacleGrid;
    const idx = edge.idx;
    return railWallEdgeAt(grid, idx, edge.side) ? getRailWallInfo(grid, idx, edge.side) : null;
}
// --- MERGED FROM sandboxSpawnSession.js ---
export function createSandboxSpawnSession(state, { getSpawnPropId, pickSelection, notifyUi, placement }) {
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    let spawnBoxWidth = DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH;
    let spawnBoxHeight = DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT;
    let spawnCrossLength = 32;
    let spawnCrossThickness = 8;
    let spawnBallRadius = null;
    let spawnVisualOverrideTint = null;
    let spawnVisualOverrideBrightness = 1;
    let spawnSnakeLength = 5;
    const resolveSpawnVisualOverride = (asset) => {
        if (!isShapeFamilyAsset(asset)) return null;
        const tint = spawnVisualOverrideTint ?? sampleAssetBaseTintHex(asset);
        const visualOverride = { tint };
        if (spawnVisualOverrideBrightness !== 1) visualOverride.brightness = spawnVisualOverrideBrightness;
        return visualOverride;
    };
    const spawnCtx = (options = {}) => ({
        spawnPropId: getSpawnPropId(),
        spawnFaction,
        resolveSpawnPropTypeId: getSpawnPropId,
        resolveSpawnVisualOverride,
        spawnBallRadius: spawnBallRadius ?? assetDefaultBallRadius(propCatalog[getSpawnPropId()]),
        spawnBoxHalfExtents: { x: spawnBoxWidth / 2, y: spawnBoxHeight / 2 },
        spawnCrossLength,
        spawnCrossThickness,
        spawnSnakeLength,
        pickSelection,
        notifyUi,
        placement,
        selectSpawned: options.selectSpawned !== false,
    });
    const spawnAt = (worldX, worldY, options = {}) => {
        const asset = propCatalog[getSpawnPropId()];
        if (!asset) return false;
        return spawnPlaceableAt(state, worldX, worldY, asset, spawnCtx(options));
    };
    return {
        getSpawnPropId,
        getSpawnFaction: () => spawnFaction,
        setSpawnFaction: (faction) => {
            spawnFaction = faction;
        },
        getSpawnBoxWidth: () => spawnBoxWidth,
        setSpawnBoxWidth: (width) => {
            spawnBoxWidth = Math.max(6, Math.min(128, Math.round(width)));
            notifyUi();
        },
        getSpawnBoxHeight: () => spawnBoxHeight,
        setSpawnBoxHeight: (height) => {
            spawnBoxHeight = Math.max(6, Math.min(128, Math.round(height)));
            notifyUi();
        },
        getSpawnBallRadius: (asset) => spawnBallRadius ?? assetDefaultBallRadius(asset),
        setSpawnBallRadius: (radius) => {
            spawnBallRadius = Math.max(1, Math.min(32, Math.round(radius)));
            notifyUi();
        },
        getSpawnVisualOverrideTint: (asset) => spawnVisualOverrideTint ?? sampleAssetBaseTintHex(asset),
        setSpawnVisualOverrideTint: (hex) => {
            spawnVisualOverrideTint = hex;
        },
        getSpawnVisualOverrideBrightness: () => spawnVisualOverrideBrightness,
        setSpawnVisualOverrideBrightness: (brightness) => {
            spawnVisualOverrideBrightness = Math.max(0.25, Math.min(2, brightness));
        },
        getSpawnCrossLength: () => spawnCrossLength,
        setSpawnCrossLength: (len) => {
            spawnCrossLength = Math.max(8, Math.min(128, Math.round(len)));
            notifyUi();
        },
        getSpawnCrossThickness: () => spawnCrossThickness,
        setSpawnCrossThickness: (thick) => {
            spawnCrossThickness = Math.max(2, Math.min(64, Math.round(thick)));
            notifyUi();
        },
        getSpawnSnakeLength: () => spawnSnakeLength,
        setSpawnSnakeLength: (len) => {
            spawnSnakeLength = Math.max(3, Math.min(9, Math.round(len)));
            notifyUi();
        },
        resolveSpawnVisualOverride,
        spawnAt,
        spawnAtCameraOrigin() {
            return spawnAt(state.viewport.x, state.viewport.y);
        },
    };
}
// --- MERGED FROM sandboxScenePlaceables.js ---
function sceneItem(seq, label, select, category = "") {
    return { seq, label, select, category };
}
function selectionMatchesSelect(selection, select) {
    if (!selection) return false;
    if (selection.kind !== select.kind) return false;
    if (selection.kind === "prop") {
        if (selection.ids.size !== select.ids.length) return false;
        for (let i = 0; i < select.ids.length; i++) if (!selection.ids.has(select.ids[i])) return false;
        return true;
    }
    if (selection.kind === "floor" || selection.kind === "voxel") return selection.idx === select.idx;
    if (selection.kind === "rail") return selection.idx === select.idx && selection.side === select.side;
    return false;
}
function inspectorResult(kind, data) {
    return data == null ? null : { kind, data };
}
function deleteWallSceneItem(session, item, pickSelection) {
    pickSelection(item.select);
    session.deleteSelectedWall();
}
export const PLACEABLE = {
    props: {
        buildFromSelection(state, sel) {
            return sel.ids.size > 1 ? { ids: [...sel.ids] } : null;
        },
    },
    prop: {
        matchesSpawnAsset() {
            return true;
        },
        spawnAt(state, worldX, worldY, asset, ctx) {
            const propTypeId = ctx.resolveSpawnPropTypeId();
            if (propTypeId === "snake") {
                const grid = state.obstacleGrid;
                const idx = grid.worldToIdx(worldX, worldY);
                if (idx === -1) return false;
                const chain = spawnLinkedBallChain(state, idx, {
                    headBallType: "snake",
                    ballType: "ball",
                    segmentCount: ctx.spawnSnakeLength,
                    segmentRadius: ctx.spawnBallRadius,
                    faction: ctx.spawnFaction,
                    spacing: ctx.spawnBallRadius * 2,
                    linkSlack: 1.0,
                });
                if (chain && chain.leader) {
                    const visualOverride = ctx.resolveSpawnVisualOverride(propCatalog["snake"]);
                    if (visualOverride) {
                        if (visualOverride.tint) setPropVisualTint(chain.leader, visualOverride.tint);
                        if (visualOverride.brightness != null) setPropVisualBrightness(chain.leader, visualOverride.brightness);
                    }
                    ctx.placement.touchPropPlacement(chain.leader.id);
                    if (ctx.selectSpawned !== false) ctx.pickSelection({ kind: "prop", ids: [chain.leader.id] });
                }
                return chain != null;
            }
            const placedAsset = propCatalog[propTypeId];
            const halfExtents = blockPresetUsesResizableFootprint(propTypeId) ? ctx.spawnBoxHalfExtents : undefined;
            const spawned = spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, ctx.spawnFaction, 0, halfExtents, ctx.resolveSpawnVisualOverride(placedAsset));
            if (spawned && isBallFamilyAsset(placedAsset)) setPropRadius(spawned, ctx.spawnBallRadius);
            if (spawned && propTypeId === "cross_pinwheel") applyCrossPinwheelFootprint(spawned, ctx.spawnCrossLength, ctx.spawnCrossThickness);
            if (spawned) {
                ctx.placement.touchPropPlacement(spawned.id);
                if (ctx.selectSpawned !== false) ctx.pickSelection({ kind: "prop", ids: [spawned.id] });
            }
            return spawned != null;
        },
        buildFromSelection(state, sel, { getLiveProp }) {
            if (sel.ids.size !== 1) return null;
            const id = [...sel.ids][0];
            return getLiveProp(id);
        },
        listSceneItems({ placement, listPlacedProps }) {
            const items = [];
            const props = listPlacedProps();
            for (let i = 0; i < props.length; i++) {
                const prop = props[i];
                const asset = propCatalog[prop.spawnTypeId ?? prop.type];
                if (!asset) continue;
                const label = `${prop.label ?? asset.label} · ${formatSandboxFactionLabel(prop.faction)}`;
                items.push(sceneItem(placement.placementSeq(placement.propPlacementKey(prop.id), prop.id), label, { kind: "prop", ids: [prop.id] }, `prop:${prop.spawnTypeId ?? prop.type}`));
            }
            return items;
        },
    },
    floorBelt: {
        matchesSpawnAsset: isGridFloorBeltSpawnAsset,
        spawnAt(state, worldX, worldY, asset, ctx) {
            const grid = state.obstacleGrid;
            const idx = grid.worldToIdx(worldX, worldY);
            if (!FloorBelt.canStampAt(state, idx, findGridAnchoredFloorPropAtIdx)) return false;
            const kind = resolveFloorBeltKindFromSpawnAsset(asset);
            if (!applyFloorCellEdit(state, idx, kind, 0)) return false;
            ctx.placement.touchFloorPlacement(idx);
            ctx.pickSelection({ kind: "floor", idx });
            return true;
        },
        buildFromSelection(state, sel) {
            return buildFloorBeltInspectorInfo(state, sel);
        },
        listSceneItems({ placement, listPlacedFloorBelts }) {
            const items = [];
            for (const entry of listPlacedFloorBelts())
                items.push(sceneItem(placement.placementSeq(placement.floorPlacementKey(entry.idx), 2e9 + entry.idx), entry.label, { kind: "floor", idx: entry.idx }, "floor"));
            return items;
        },
    },
    voxel: {
        matchesSpawnAsset(asset) {
            return asset.category === "block" && !isResizableBoxSpawnAsset(asset);
        },
        spawnAt() {
            return false;
        },
        buildFromSelection(state, sel) {
            return buildVoxelWallInspectorInfo(state, sel);
        },
        listSceneItems({ placement }) {
            const items = [];
            for (const entry of placement.listTrackedVoxelWalls())
                items.push(sceneItem(placement.placementSeq(placement.voxelPlacementKey(entry.idx), 3e9 + entry.idx), entry.label, { kind: "voxel", idx: entry.idx }, "wall:voxel"));
            return items;
        },
    },
    rail: {
        buildFromSelection(state, sel) {
            return buildRailWallInspectorInfo(state, sel);
        },
        listSceneItems({ placement }) {
            const items = [];
            for (const entry of placement.listTrackedRailWalls())
                items.push(
                    sceneItem(
                        placement.placementSeq(placement.edgePlacementKey("rail", entry.idx, entry.side), 4e9 + entry.idx + entry.side * 1e8),
                        entry.label,
                        { kind: "rail", idx: entry.idx, side: entry.side },
                        "wall:rail",
                    ),
                );
            return items;
        },
    },
};
const SPAWN_ROWS = [PLACEABLE.floorBelt, PLACEABLE.prop];
const FROM_SELECTION = {
    prop(state, sel, ctx) {
        if (sel.ids.size > 1) return inspectorResult("props", PLACEABLE.props.buildFromSelection(state, sel, ctx));
        return inspectorResult("prop", PLACEABLE.prop.buildFromSelection(state, sel, ctx));
    },
    floor(state, sel, ctx) {
        return inspectorResult("floorBelt", PLACEABLE.floorBelt.buildFromSelection(state, sel, ctx));
    },
    voxel(state, sel, ctx) {
        return inspectorResult("voxel", PLACEABLE.voxel.buildFromSelection(state, sel, ctx));
    },
    rail(state, sel, ctx) {
        return inspectorResult("rail", PLACEABLE.rail.buildFromSelection(state, sel, ctx));
    },
};
const DELETE_BY_SELECT_KIND = {
    prop(session, item) {
        session.deletePropById(item.select.ids[0]);
    },
    floor(session, item, pickSelection) {
        pickSelection(item.select);
        session.deleteSelectedFloorCell();
    },
    voxel: deleteWallSceneItem,
    rail: deleteWallSceneItem,
};
const SCENE_LISTERS = [PLACEABLE.prop.listSceneItems, PLACEABLE.floorBelt.listSceneItems, PLACEABLE.voxel.listSceneItems, PLACEABLE.rail.listSceneItems];
export function spawnPlaceableAt(state, worldX, worldY, asset, ctx) {
    for (let i = 0; i < SPAWN_ROWS.length; i++) {
        const row = SPAWN_ROWS[i];
        if (!row.matchesSpawnAsset(asset)) continue;
        return row.spawnAt(state, worldX, worldY, asset, ctx);
    }
    return false;
}
export function buildSelectionInspector(state, selection, getLiveProp, pruneSelection) {
    pruneSelection();
    const sel = selection.getSelection();
    if (!sel) return null;
    return FROM_SELECTION[sel.kind](state, sel, { getLiveProp });
}
export function wallPlaceInspector(inspector) {
    if (inspector?.kind === "voxel" || inspector?.kind === "rail") return inspector;
    return null;
}
export const PLACEABLE_INSPECTOR_KINDS = ["prop", "floorBelt", "voxel", "rail"];
export function listPlacedSceneItems(ctx) {
    const items = [];
    for (let i = 0; i < SCENE_LISTERS.length; i++) items.push(...SCENE_LISTERS[i](ctx));
    items.sort((a, b) => a.seq - b.seq);
    return items;
}
export function matchesSceneItem(selection, item) {
    return selectionMatchesSelect(selection, item.select);
}
export function pickSceneItem(item, { pickSelection, setPlacePaletteKey }) {
    if (item.paletteKey != null && setPlacePaletteKey != null) setPlacePaletteKey(item.paletteKey);
    pickSelection(item.select);
}
export function removeSceneItem(session, item, pickSelection) {
    DELETE_BY_SELECT_KIND[item.select.kind](session, item, pickSelection);
}
// --- MERGED FROM sandboxSceneSnapshot.js ---
/**
 * Sandbox scene snapshot — copy/paste JSON for props, stamped grid walls, and floor belts.
 *
 * `schemaVersion` is the live format only. No migration layer, no backwards-compatible
 * loaders, and no compat shims for older JSON yet. When the format changes, bump the
 * version and treat old paste blobs as invalid — save/load is not a stable product
 * boundary until we deliberately add that.
 */
/** Current snapshot format; bump when fields change (no vN→vN+1 migration code until then). */
export const SANDBOX_SCENE_SCHEMA_VERSION = 11;
/** @param {object} state */
export function collectSandboxSceneSnapshot(state) {
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const { props, propIdToIndex } = collectFlatPlacedSandboxPropEntries(state);
    const headProp = findLiveWorldProp(state.worldProps, (prop) => meta.isChainHead(prop.id));
    const chainHeadProp = headProp ? (propIdToIndex.get(headProp.id) ?? null) : null;
    const cellSize = grid.cellSize;
    const voxels = listPlacedVoxelWalls(grid).map(({ idx, heightLevel }) => {
        return { idx, heightLevel };
    });
    const railWalls = [];
    const listed = listPlacedRailWalls(grid);
    for (let i = 0; i < listed.length; i++) {
        const { idx, side, heightLevel, thicknessLevel } = listed[i];
        if (!isCanonicalEdgeRepresentativeIdx(grid, idx, side)) continue;
        railWalls.push({ idx, side, heightLevel, thicknessLevel });
    }
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize: grid.cellSize,
        origin: { minX: grid.minX, minY: grid.minY },
        cols: grid.cols,
        rows: grid.rows,
        voxels,
        railWalls,
        floorBelts: FloorBelt.listPlacedForSnapshot(grid),
        props,
        kineticConstraints: collectKineticConstraintsSnapshot(state.kinetic, propIdToIndex),
        chainHeadProp,
    };
}
/** @param {unknown} raw */
export function parseSandboxSceneSnapshot(raw) {
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== "object") throw new Error("Scene JSON must be an object");
    return doc;
}
/** @param {object} state @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc */
function expandGridForSnapshot(state, doc) {
    const cellSize = doc.cellSize ?? state.obstacleGrid.cellSize;
    const cellHalfSize = state.obstacleGrid.cellHalfSize;
    const bounds = emptyAabb();
    const includeWorldPoint = (x, y) => growAabbFromCenterInto(bounds, x, y, cellHalfSize, cellHalfSize);
    const includeDocIdx = (idx) => {
        includeWorldPoint(doc.origin.minX + (idx % doc.cols) * cellSize + cellHalfSize, doc.origin.minY + Math.floor(idx / doc.cols) * cellSize + cellHalfSize);
    };
    for (let i = 0; i < doc.voxels.length; i++) includeDocIdx(doc.voxels[i].idx);
    for (let i = 0; i < doc.railWalls.length; i++) includeDocIdx(doc.railWalls[i].idx);
    for (let i = 0; i < doc.floorBelts.length; i++) includeDocIdx(doc.floorBelts[i].idx);
    for (let i = 0; i < doc.props.length; i++) includeWorldPoint(doc.props[i].x, doc.props[i].y);
    if (isEmptyAabb(bounds)) return;
    state.obstacleGrid.expandToCoverAabb(bounds);
}
/** @param {object} state */
function clearSandboxSceneContent(state) {
    for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i], state.spatialFrame);
    clearKineticConstraints(state.kinetic);
    state.obstacleGrid.clearAllFloorCells();
    clearAllStampedGridWalls(state, { notify: false });
    getSandboxEntityMeta(state).clear();
    clearGridStampDrawCaches(state);
}
/** @param {object} state @param {{ type: string, x: number, y: number, facing?: number, faction?: string, width?: number, height?: number }} entry */
function spawnSnapshotProp(state, entry) {
    const asset = propCatalog[entry.type];
    if (!asset) throw new Error(`Unknown prop type: ${entry.type}`);
    if (isGridFloorBeltSpawnAsset(asset)) return null;
    const halfExtents = entry.width != null && entry.height != null ? { x: entry.width / 2, y: entry.height / 2 } : undefined;
    const prop = spawnPlacedSandboxProp(state, entry.x, entry.y, entry.type, entry.faction ?? SANDBOX_DEFAULT_FACTION, entry.facing ?? 0, halfExtents, entry.visualOverride);
    if (entry.radius != null) setPropRadius(prop, entry.radius);
    if (prop && entry.type === "cross_pinwheel" && (entry.crossLength != null || entry.crossThickness != null)) applyCrossPinwheelFootprint(prop, entry.crossLength ?? 32, entry.crossThickness ?? 8);
    return prop;
}
/** @param {object} state @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc */
function spawnSnapshotProps(state, doc) {
    const propRefs = new Array(doc.props.length);
    for (let i = 0; i < doc.props.length; i++) {
        const prop = spawnSnapshotProp(state, doc.props[i]);
        if (prop) propRefs[i] = prop;
    }
    if (doc.schemaVersion >= 11 && doc.kineticConstraints?.length) applyKineticConstraintsFromSnapshot(state.kinetic, doc.kineticConstraints, propRefs);
    if (doc.schemaVersion >= 11 && doc.chainHeadProp != null) {
        const headProp = propRefs[doc.chainHeadProp];
        if (headProp) setChainHead(state, getSandboxEntityMeta(state), headProp.id);
    }
}
/**
 * @param {object} state
 * @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc
 * @param {{ mode?: "replace" | "merge" }} [options]
 */
export async function applySandboxSceneSnapshot(state, doc, { mode = "replace" } = {}) {
    if (mode !== "replace") throw new Error("Only replace mode is supported");
    const cellSize = doc.cellSize ?? state.obstacleGrid.cellSize;
    if (cellSize !== state.obstacleGrid.cellSize) throw new Error(`Scene cellSize ${cellSize} does not match grid ${state.obstacleGrid.cellSize}`);
    clearSandboxSceneContent(state);
    expandGridForSnapshot(state, doc);
    const wallBounds = applyStampedGridWallsFromSnapshot(state, doc);
    FloorBelt.applyFromSnapshot(state, doc);
    const grid = state.obstacleGrid;
    if (wallBounds) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    await commitGridNavEdit(state, null, { fullNavSync: true });
    spawnSnapshotProps(state, doc);
}
// --- MERGED FROM sandboxSession.js ---
/** @param {object} state */
export function createSandboxSession(state) {
    let placePaletteKey = "";
    let wallStampMode = "voxel";
    let wallHeightLevel = 1;
    let railThicknessLevel = 4;
    let selectionTagFilter = "all";
    let uiSync = null;
    function notifyUi() {
        uiSync?.();
    }
    const registry = () => state.entityRegistry;
    const placement = createSandboxPlacementOrder(state);
    const selection = createSandboxSelection({ isLiveProp: (id) => !!registry().getLive(id) });
    const pickSelection = (input) => {
        selection.select(input);
        if (input != null) clearPlaceMode();
        notifyUi();
    };
    const clearSelection = () => {
        selection.clearSelection();
        notifyUi();
    };
    const clearPlaceMode = () => {
        if (placePaletteKey === "") return;
        placePaletteKey = "";
        notifyUi();
    };
    const pruneSelection = () => {
        if (!selection.prunePropSelection()) return;
        notifyUi();
    };
    const sel = () => selection.getSelection();
    const spawnPropIdFromPalette = () => (placePaletteKey.startsWith("prop:") ? placePaletteKey.slice(5) : "");
    const setPlacePaletteKey = (key) => {
        const hadSelection = selection.getSelection() != null;
        const changed = placePaletteKey !== key;
        placePaletteKey = key;
        if (key.startsWith("wall:")) wallStampMode = /** @type {'voxel' | 'rail'} */ (key.slice(5));
        selection.clearSelection();
        if (changed || hadSelection) notifyUi();
    };
    const listPlacedProps = () => {
        const counts = new Map();
        const placed = [];
        visitLiveWorldProps(state.worldProps, (prop) => {
            const typeLabel = formatPropTypeLabel(prop.type);
            const index = (counts.get(prop.type) ?? 0) + 1;
            counts.set(prop.type, index);
            placed.push({ id: prop.id, type: prop.type, faction: resolveSandboxFaction(prop), label: `${typeLabel} #${index}` });
        });
        return placed;
    };
    const listPlacedFloorBelts = () => {
        const grid = state.obstacleGrid;
        const counts = new Map();
        const placed = [];
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++) {
            if (!(grid.floorKind[idx] !== 0)) continue;
            const kind = grid.floorKind[idx];
            const index = (counts.get(kind) ?? 0) + 1;
            counts.set(kind, index);
            const facingLabel = FloorBelt.formatFacingLabel(grid.floorFacing[idx]);
            placed.push({ idx, kind, facingIndex: grid.floorFacing[idx], label: `${FloorBelt.formatKindLabel(kind)} #${index} · ${facingLabel}` });
        }
        return placed;
    };
    const spawn = createSandboxSpawnSession(state, { getSpawnPropId: spawnPropIdFromPalette, pickSelection, notifyUi, placement });
    const removeProp = (prop) => removeSandboxWorldProp(state, prop, state.spatialFrame);
    const listSelectedPropEntries = () => {
        pruneSelection();
        const ids = selectionPropIds(sel());
        const entries = [];
        for (let i = 0; i < ids.length; i++) {
            const prop = registry().getLive(ids[i]);
            if (!prop) continue;
            entries.push({ id: prop.id, label: formatPropTypeLabel(prop.type) });
        }
        return entries;
    };
    const selectAllPropsWithTagFilter = (filter) => {
        const ids = [];
        visitLiveWorldProps(state.worldProps, (prop) => {
            if (!sandboxAssetMatchesTagFilter(propCatalog[prop.type], filter)) return;
            ids.push(prop.id);
        });
        pickSelection(ids.length === 0 ? null : { kind: "prop", ids });
    };
    const filterPropSelectionToTag = (filter) => {
        const current = sel();
        if (current?.kind !== "prop") return;
        const next = new Set();
        for (const id of current.ids) {
            const prop = registry().getLive(id);
            if (prop && sandboxAssetMatchesTagFilter(propCatalog[prop.type], filter)) next.add(id);
        }
        selection.select(next.size === 0 ? null : { kind: "prop", ids: [...next] });
        notifyUi();
    };
    return {
        getSelection: () => sel(),
        pickSelection,
        clearSelection,
        getPlacePaletteKey: () => placePaletteKey,
        setPlacePaletteKey,
        getWallStampMode: () => wallStampMode,
        setWallStampMode(mode) {
            wallStampMode = mode;
            notifyUi();
        },
        getWallHeightLevel: () => wallHeightLevel,
        setWallHeightLevel(level) {
            wallHeightLevel = Math.max(1, Math.min(3, Math.round(level)));
            notifyUi();
        },
        getRailThicknessLevel: () => railThicknessLevel,
        setRailThicknessLevel(level) {
            railThicknessLevel = level;
            notifyUi();
        },
        rotateSelectedFloorBelt(steps = 1) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const idx = floorCell.idx;
            if (!(state.obstacleGrid.floorKind[idx] !== 0)) {
                clearSelection();
                return false;
            }
            if (!FloorBelt.rotateOccupantAt(state, idx, steps, commitGridNavEdit)) return false;
            notifyUi();
            return true;
        },
        rotateHoveredGridOccupantAtWorld(worldX, worldY, steps = 1) {
            const occupantIdx = FloorBelt.pickRotatableOccupantAtWorld(state, worldX, worldY);
            if (occupantIdx === -1) return false;
            if (!FloorBelt.rotateOccupantAt(state, occupantIdx, steps, commitGridNavEdit)) return false;
            pickSelection({ kind: "floor", idx: occupantIdx });
            return true;
        },
        moveSelectedFloorBeltTo(targetIdx) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const idx = floorCell.idx;
            if (idx === targetIdx) return true;
            if (!(grid.floorKind[idx] !== 0)) {
                clearSelection();
                return false;
            }
            if (!FloorBelt.canStampAt(state, targetIdx, findGridAnchoredFloorPropAtIdx)) return false;
            const kind = grid.floorKind[idx];
            const facingIndex = grid.floorFacing[idx];
            grid.clearFloorCell(idx);
            if (!grid.writeFloorCell(targetIdx, kind, facingIndex)) {
                grid.writeFloorCell(idx, kind, facingIndex);
                return false;
            }
            commitGridNavEdit(state, idx);
            commitGridNavEdit(state, targetIdx);
            pickSelection({ kind: "floor", idx: targetIdx });
            return true;
        },
        setSelectedFloorBeltKind(kind) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const idx = floorCell.idx;
            if (!(grid.floorKind[idx] !== 0)) {
                clearSelection();
                return false;
            }
            if (grid.floorKind[idx] === kind) return true;
            applyFloorCellEdit(state, idx, kind, grid.floorFacing[idx]);
            notifyUi();
            return true;
        },
        deleteSelectedFloorCell() {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const idx = floorCell.idx;
            if (grid.floorKind[idx] !== 0) {
                if (!clearFloorCellNavEdit(state, idx)) return false;
            } else if (!grid.clearFloorCell(idx)) return false;
            else FloorBelt.markZoneSubscriptionsDirty(state);
            placement.forgetFloorPlacement(idx);
            clearSelection();
            return true;
        },
        listPlacedVoxelWalls: () => listPlacedVoxelWalls(state.obstacleGrid),
        listPlacedRailWalls: () => listPlacedRailWalls(state.obstacleGrid),
        stampWallAtWorld(worldX, worldY) {
            const targetIdx = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(state.obstacleGrid, worldX, worldY);
                if (!hit) return false;
                if (railWallEdgeAt(state.obstacleGrid, hit.idx, hit.side)) {
                    pickSelection({ kind: "rail", idx: hit.idx, side: hit.side });
                    return true;
                }
                if (!stampRailWallAt(state, hit.idx, hit.side, wallHeightLevel, railThicknessLevel)) return false;
                placement.touchEdgePlacement("rail", hit.idx, hit.side);
                pickSelection({ kind: "rail", idx: hit.idx, side: hit.side });
                return true;
            }
            if (cellIsStaticWall(state.obstacleGrid, targetIdx)) {
                pickSelection({ kind: "voxel", idx: targetIdx });
                return true;
            }
            if (!stampVoxelWallAt(state, targetIdx, wallHeightLevel)) return false;
            placement.touchVoxelPlacement(targetIdx);
            pickSelection({ kind: "voxel", idx: targetIdx });
            return true;
        },
        stampWallAtCameraOrigin() {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            return this.stampWallAtWorld(origin.x, origin.y);
        },
        setSelectedVoxelWallHeight(heightLevel) {
            const voxelCell = selectionVoxelCell(sel());
            if (!voxelCell) return false;
            const idx = voxelCell.idx;
            if (!setVoxelWallHeightAt(state, idx, heightLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallProps(heightLevel, thicknessLevel) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const idx = railEdge.idx;
            if (!stampRailWallAt(state, idx, railEdge.side, heightLevel, thicknessLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallSide(newSide) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const grid = state.obstacleGrid;
            const idx = railEdge.idx;
            const info = getRailWallInfo(grid, idx, railEdge.side);
            if (!info || info.side === newSide) return true;
            if (railWallEdgeAt(grid, idx, newSide)) return false;
            if (!clearRailWallAt(state, idx, railEdge.side)) return false;
            if (!stampRailWallAt(state, idx, newSide, info.heightLevel, info.thicknessLevel)) return false;
            pickSelection({ kind: "rail", idx, side: newSide });
            return true;
        },
        deleteSelectedWall() {
            const voxelCell = selectionVoxelCell(sel());
            if (voxelCell) {
                const idx = voxelCell.idx;
                if (!clearVoxelWallAt(state, idx)) return false;
                placement.forgetVoxelPlacement(idx);
                clearSelection();
                return true;
            }
            const railEdge = selectionRailEdge(sel());
            if (railEdge) {
                const grid = state.obstacleGrid;
                const idx = railEdge.idx;
                if (!clearRailWallAt(state, idx, railEdge.side)) return false;
                placement.forgetEdgePlacement("rail", idx, railEdge.side);
                clearSelection();
                return true;
            }
            return false;
        },
        deleteWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                const idx = hit.idx;
                if (!railWallEdgeAt(grid, idx, hit.side)) return false;
                if (!clearRailWallAt(state, idx, hit.side)) return false;
                placement.forgetEdgePlacement("rail", idx, hit.side);
                selection.dropDeletedWallSelection(idx, hit.side);
                notifyUi();
                return true;
            }
            const idx = grid.worldToIdx(worldX, worldY);
            if (idx === -1) return false;
            if (!clearVoxelWallAt(state, idx)) return false;
            placement.forgetVoxelPlacement(idx);
            selection.dropDeletedWallSelection(idx);
            notifyUi();
            return true;
        },
        pickAnyWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const edgeHit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (edgeHit) {
                const { idx, side } = edgeHit;
                if (railWallEdgeAt(grid, idx, side)) {
                    placePaletteKey = "wall:rail";
                    wallStampMode = "rail";
                    pickSelection({ kind: "rail", idx, side });
                    return true;
                }
            }
            const idx = grid.worldToIdx(worldX, worldY);
            if (idx === -1) return false;
            if (!cellIsStaticWall(grid, idx)) return false;
            placePaletteKey = "wall:voxel";
            wallStampMode = "voxel";
            pickSelection({ kind: "voxel", idx });
            return true;
        },
        pickWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !railWallEdgeAt(grid, hit.idx, hit.side)) return false;
                pickSelection({ kind: "rail", idx: hit.idx, side: hit.side });
                return true;
            }
            const idx = grid.worldToIdx(worldX, worldY);
            if (idx === -1) return false;
            if (!cellIsStaticWall(grid, idx)) return false;
            pickSelection({ kind: "voxel", idx });
            return true;
        },
        getSelectedProp: () => {
            pruneSelection();
            const id = selectionPrimaryPropId(sel(), (id) => registry().getLive(id));
            return id == null ? null : registry().getLive(id);
        },
        isSelected(id) {
            const current = sel();
            return current?.kind === "prop" && current.ids.has(id);
        },
        pruneSelection,
        deleteProp(prop) {
            if (!prop) return;
            selection.removePropFromSelection(prop.id);
            placement.forgetPropPlacement(prop.id);
            removeProp(prop);
            notifyUi();
        },
        deletePropById(id) {
            this.deleteProp(registry().get(id));
        },
        removePropFromSelection(id) {
            if (selection.removePropFromSelection(id)) notifyUi();
        },
        togglePropInSelection(id) {
            return selection.togglePropInSelection(id);
        },
        deleteSelectedProps() {
            const ids = selectionPropIds(sel());
            for (let i = 0; i < ids.length; i++) {
                placement.forgetPropPlacement(ids[i]);
                removeProp(registry().get(ids[i]));
            }
            clearSelection();
            notifyUi();
        },
        getSelectionTagFilter: () => selectionTagFilter,
        setSelectionTagFilter: (filter) => {
            if (selectionTagFilter === filter) return;
            selectionTagFilter = filter;
            notifyUi();
        },
        listSelectedPropEntries,
        selectAllPropsWithTagFilter,
        filterPropSelectionToTag,
        listPlacedProps,
        listPlacedFloorBelts,
        placement,
        seedPlacementOrderFromState() {
            placement.resetPlacementOrder();
            const props = listPlacedProps().sort((a, b) => a.id - b.id);
            for (let i = 0; i < props.length; i++) placement.touchPropPlacement(props[i].id);
            for (const entry of listPlacedFloorBelts()) placement.touchFloorPlacement(entry.idx);
            for (const entry of listPlacedVoxelWalls(state.obstacleGrid)) placement.touchVoxelPlacement(entry.idx);
            for (const entry of listPlacedRailWalls(state.obstacleGrid)) placement.touchEdgePlacement("rail", entry.idx, entry.side);
        },
        ...spawn,
        select: pickSelection,
        getSelectionInspector: () => buildSelectionInspector(state, selection, (id) => registry().getLive(id), pruneSelection),
        isWallPlaceMode: () => placePaletteKey.startsWith("wall:"),
        isMapGenPlaceMode: () => placePaletteKey.startsWith("mapGen:"),
        listPlacedSceneItems() {
            return listPlacedSceneItems(this);
        },
        isSceneItemSelected(item) {
            return matchesSceneItem(sel(), item);
        },
        selectSceneItem(item) {
            pickSceneItem(item, { pickSelection, setPlacePaletteKey });
        },
        deleteSceneItem(item) {
            removeSceneItem(this, item, pickSelection);
        },
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i], state.spatialFrame);
            state.obstacleGrid.clearAllFloorCells();
            selection.clearSelection();
            placement.resetPlacementOrder();
            notifyUi();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync: notifyUi,
    };
}
// --- MERGED FROM props sandbox behaviors ---
// --- MERGED FROM cueStrikeBehavior.js ---
export const CUE_STRIKE_BEHAVIOR_ID = "cueStrike";
/** @param {object} state @param {object} prop @param {object} asset */
function getCueStrikeConfig(state, prop, asset) {
    return { ...DRAG_LAUNCH_DEFAULTS, ...resolveWorldPropSandboxBehavior(state, prop, asset, "cueStrike") };
}
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createCueStrikeBehavior(state) {
    return createDragLaunchInteraction({
        id: CUE_STRIKE_BEHAVIOR_ID,
        getConfig: (prop) => getCueStrikeConfig(state, prop, propCatalog[prop.type]),
        canStart(prop) {
            return evaluateInputGates(CUE_STRIKE_BEHAVIOR_ID, prop, propCatalog[prop.type], state).allowed;
        },
        onLaunch(prop, shot) {
            applyCueStrikeCollision(prop, shot);
        },
        buildAimLineContext(prop) {
            return buildCueStrikeAimLineContext(prop, state);
        },
        resolveAimLine: getCueStrikeAimLine,
    });
}

// --- MERGED FROM dragLaunchFacingBehavior.js ---
export const DRAG_LAUNCH_FACING_BEHAVIOR_ID = "dragLaunchFacing";
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createDragLaunchFacingBehavior(state) {
    return createDragLaunchInteraction({
        id: DRAG_LAUNCH_FACING_BEHAVIOR_ID,
        getConfig: (prop) => getDragLaunchConfig(propCatalog[prop.type]),
        buildAimLineContext: dragLaunchAimLineContextForState(state),
        onLaunch(prop, shot) {
            prop.facing = Math.atan2(shot.ny, shot.nx);
            prop.angularVelocity = 0;
            prop.strategy.syncCollisionShape?.(prop);
            applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
        },
    });
}

// --- MERGED FROM flipperBehavior.js ---
export const FLIPPER_BEHAVIOR_ID = "flipper";
const SWING_SPEED_RAD = 20;
const RETURN_SPEED_RAD = 8;
const FLIPPER_ANGLE_STEPS = 24;
/** @param {object} prop */
export function isFlipperWorldProp(prop) {
    return Boolean(propCatalog[prop?.type]?.flipper?.side);
}
/** @param {object} asset */
function flipperConfig(asset) {
    return asset?.flipper ?? {};
}
/** @param {object} cfg */
function resolveFlipperDims(cfg) {
    return {
        length: cfg.length ?? FLIPPER_LAYOUT.length,
        width: cfg.width ?? FLIPPER_LAYOUT.width,
        height: cfg.height ?? FLIPPER_LAYOUT.height,
        pivotRadius: cfg.pivotRadius ?? FLIPPER_LAYOUT.pivotRadius,
    };
}
/** @param {object} prop @param {object} asset */
export function getFlipperSpec(prop, asset) {
    const cfg = flipperConfig(asset);
    const dims = resolveFlipperDims(cfg);
    return {
        side: cfg.side ?? "left",
        extendDir: cfg.extendDir ?? 1,
        length: dims.length,
        width: dims.width,
        height: dims.height,
        pivotRadius: dims.pivotRadius,
        restAngle: prop._flipperRestAngle ?? cfg.restAngle ?? 0.45,
        activeAngle: prop._flipperActiveAngle ?? cfg.activeAngle ?? -0.55,
    };
}
/** @param {object | null | undefined} prop @param {{ hold?: boolean }} [options] */
export function triggerFlipper(prop, { hold = true } = {}) {
    if (!prop) return;
    prop._flipperTarget = "active";
    prop._flipperButtonPressed = hold;
}
/** @param {object | null | undefined} prop */
export function releaseFlipper(prop) {
    if (!prop) return;
    prop._flipperTarget = "rest";
    prop._flipperButtonPressed = false;
}
/** @param {object | null | undefined} prop */
export function isFlipperButtonPressed(prop) {
    if (!prop) return false;
    return Boolean(prop._flipperButtonPressed || prop._flipperTarget === "active");
}
/** @param {object} prop */
export function getFlipperSpriteCacheKey(prop) {
    const asset = propCatalog[prop.type];
    const cfg = flipperConfig(asset);
    const spec = getFlipperSpec(prop, asset);
    const angle = prop._flipperAngle ?? cfg.restAngle ?? 0.45;
    const active = prop._flipperTarget === "active" || prop._flipperButtonPressed ? 1 : 0;
    return `${cfg.side ?? "left"}_L${Math.round(spec.length)}_a${quantizeAngleIndex(angle, FLIPPER_ANGLE_STEPS)}_${active}`;
}
/** @param {object} prop */
export function syncFlipperCollisionShape(prop) {
    const asset = propCatalog[prop.type];
    const spec = getFlipperSpec(prop, asset);
    if (prop._flipperAngle == null) prop._flipperAngle = spec.restAngle;
    const { length, width, extendDir } = spec;
    const halfW = width * 0.5;
    const angle = prop._flipperAngle;
    const key = `flip_${spec.side}_${angle.toFixed(3)}_${length}_${halfW}`;
    if (prop._flipperShapeKey === key && prop.shape?.type === "Polygon") return prop.shape;
    const tipR = Math.max(1, halfW * 0.45);
    prop.shape = new PolygonShape(new Float32Array([0, -halfW, (length - tipR) * extendDir, -tipR, length * extendDir, 0, (length - tipR) * extendDir, tipR, 0, halfW]));
    prop._collisionFacing = angle;
    prop._flipperShapeKey = key;
    return prop.shape;
}
/** @param {object} prop @param {object} asset */
function initFlipperAngle(prop, asset) {
    if (prop._flipperAngle == null) {
        prop._flipperAngle = getFlipperSpec(prop, asset).restAngle;
        prop._flipperTarget = "rest";
    }
}
/** @param {object} prop @param {object} asset @param {number} dt */
function tickFlipperWorldProp(prop, asset, dt) {
    initFlipperAngle(prop, asset);
    const spec = getFlipperSpec(prop, asset);
    const isActivating = prop._flipperTarget === "active";
    const target = isActivating ? spec.activeAngle : spec.restAngle;
    const speed = isActivating ? SWING_SPEED_RAD : RETURN_SPEED_RAD;
    const dtSec = dt / 1000;
    const prevAngle = prop._flipperAngle;
    const diff = target - prevAngle;
    const maxStep = speed * dtSec;
    if (Math.abs(diff) <= maxStep) {
        prop._flipperAngle = target;
        if (isActivating && !prop._flipperButtonPressed) prop._flipperTarget = "rest";
    } else prop._flipperAngle = prevAngle + Math.sign(diff) * maxStep;
    prop._flipperAngVel = (prop._flipperAngle - prevAngle) / dtSec;
    prop.angularVelocity = prop._flipperAngVel;
    prop.vx = 0;
    prop.vy = 0;
    syncFlipperCollisionShape(prop);
}
/** @param {object} state @param {number} dt */
function tickAllFlippers(state, dt) {
    const worldProps = state.worldProps;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead || !isFlipperWorldProp(prop)) continue;
        const asset = propCatalog[prop.type];
        if (!asset) continue;
        tickFlipperWorldProp(prop, asset, dt);
    }
}
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createFlipperBehavior(state) {
    return {
        id: FLIPPER_BEHAVIOR_ID,
        supports(_prop, asset) {
            return asset?.sandbox?.behaviors?.includes(FLIPPER_BEHAVIOR_ID) ?? false;
        },
        tickWorld(dt) {
            tickAllFlippers(state, dt);
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        reset() {},
    };
}

// --- MERGED FROM spawnerBehavior.js ---
export const SPAWNER_BEHAVIOR_ID = "spawner";
/** @param {object} prop @param {import("../dragLaunch.js").DragLaunchAim | null} aim */
function aimSpawnerFacing(prop, aim) {
    if (aim?.shotNx == null || aim.shotNy == null) return;
    prop.facing = Math.atan2(aim.shotNy, aim.shotNx);
    prop.angularVelocity = 0;
    prop.strategy.syncCollisionShape?.(prop);
}
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createSpawnerBehavior(state) {
    return {
        ...createDragLaunchInteraction({
            id: SPAWNER_BEHAVIOR_ID,
            getConfig: (prop) => getSpawnerDragConfig(prop, propCatalog[prop.type]),
            buildAimLineContext: dragLaunchAimLineContextForState(state),
            onAim: aimSpawnerFacing,
            onLaunch(prop, shot) {
                fireSpawner(state, prop, { nx: shot.nx, ny: shot.ny, power: shot.power });
            },
        }),
        supports(_prop, asset) {
            return isSpawnerProp(asset);
        },
    };
}

// --- MERGED FROM spawnerConfig.js ---
/** @param {object | null | undefined} asset */
export function isSpawnerProp(asset) {
    return asset?.sandbox?.spawner != null && typeof asset.sandbox.spawner === "object";
}
/** @param {object | null | undefined} prop */
export function isSpawnerWorldProp(prop) {
    return isSpawnerProp(propCatalog[prop?.type]);
}
/** @param {object | null | undefined} prop @param {object | null | undefined} asset */
export function resolveSpawnerPropId(prop, asset) {
    return prop?.sandboxSpawnerPropId ?? asset.sandbox.spawner.defaultPropId;
}
/** @param {object | null | undefined} prop @param {object | null | undefined} asset */
export function getSpawnerDragConfig(_prop, asset) {
    const overrides = asset?.sandbox?.spawner?.dragLaunch;
    return { ...DRAG_LAUNCH_DEFAULTS, ...(overrides && typeof overrides === "object" ? overrides : {}) };
}
/** @param {object} prop @param {object | null | undefined} asset */
export function getSpawnerOutletWorld(prop, asset) {
    const resolver = asset?.sandbox?.spawner?.getOutletWorld;
    if (typeof resolver === "function") return resolver(prop, asset);
    const facing = prop.facing ?? 0;
    const reach = prop.radius ?? 8;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    return { x: prop.x + cos * reach, y: prop.y + sin * reach, nx: cos, ny: sin };
}
/**
 * @param {object} state
 * @param {object} spawnerWorldProp
 * @param {{ power?: number, nx?: number, ny?: number }} [options]
 */
export function fireSpawner(state, spawnerWorldProp, { power, nx, ny } = {}) {
    const asset = propCatalog[spawnerWorldProp.type];
    if (!isSpawnerProp(asset)) return null;
    const config = getSpawnerDragConfig(spawnerWorldProp, asset);
    const outlet = getSpawnerOutletWorld(spawnerWorldProp, asset);
    const launchNx = nx ?? outlet.nx;
    const launchNy = ny ?? outlet.ny;
    const launchPower = power ?? config.maxPower;
    const spawnId = resolveSpawnerPropId(spawnerWorldProp, asset);
    const spawned = new WorldProp(outlet.x, outlet.y, spawnId, Math.atan2(launchNy, launchNx));
    spawned.faction = resolveSandboxFaction(spawnerWorldProp);
    const spawnVisualOverride = asset.sandbox.spawner.defaultVisualOverride;
    if (spawnVisualOverride) stampPropVisualOverride(spawned, spawnVisualOverride);
    applyDragLaunchVelocity(spawned, launchNx, launchNy, launchPower);
    addWorldPropToState(state, spawned);
    return spawned;
}
/** @returns {string[]} */
export function listSpawnerSpawnPropIds() {
    return Object.keys(propCatalog)
        .filter((id) => {
            const asset = propCatalog[id];
            return isSandboxSpawnable(asset) && !isSpawnerProp(asset);
        })
        .sort();
}

// --- MERGED FROM spawnAgentChain.js ---
function resolveSegmentPropId(index, { leaderIndex = 0, headPropId, bodyPropId, leaderPropId, resolvePropId }) {
    if (resolvePropId) return resolvePropId(index);
    const leaderId = leaderPropId ?? headPropId ?? bodyPropId;
    if (index === leaderIndex) return leaderId;
    return bodyPropId ?? headPropId ?? leaderId;
}
function applySegmentRadius(prop, segmentRadius, headScaleFn) {
    if (headScaleFn) headScaleFn(prop, segmentRadius);
    else if (segmentRadius != null) {
        const shape = prop.shape;
        if (shape?.type === "Polygon") setPropRadius(prop, segmentRadius);
        else setPropRadius(prop, segmentRadius);
    }
}
export function spawnAgentChain(state, anchorIdx, spec) {
    const {
        headPropId,
        bodyPropId,
        leaderPropId,
        leaderIndex = 0,
        segmentCount = 2,
        faction,
        exportType = null,
        linkSlack = 1.0,
        segmentRadius = null,
        growDirX = -1,
        growDirY = 0,
        spacing = null,
        headScaleFn = null,
        onSegmentSpawned = null,
        spawnGroupId = null,
        resolvePropId = null,
    } = spec;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const anchorWorld = grid.gridToWorldByIdx(anchorIdx);
    const props = [];
    const propSpec = { leaderIndex, headPropId, bodyPropId, leaderPropId, resolvePropId };
    const firstProp = spawnPlacedSandboxProp(state, anchorWorld.x, anchorWorld.y, resolveSegmentPropId(0, propSpec), faction);
    applySegmentRadius(firstProp, segmentRadius, headScaleFn);
    props.push(firstProp);
    if (onSegmentSpawned) onSegmentSpawned(firstProp, 0);
    let lastProp = firstProp;
    for (let i = 1; i < segmentCount; i++) {
        const bodyProp = spawnPlacedSandboxProp(state, lastProp.x, lastProp.y, resolveSegmentPropId(i, propSpec), faction);
        applySegmentRadius(bodyProp, segmentRadius, null);
        if (onSegmentSpawned) onSegmentSpawned(bodyProp, i);
        const dist = spacing ?? resolveChainLinkRestLength(lastProp, bodyProp, linkSlack);
        bodyProp.x = lastProp.x + growDirX * dist;
        bodyProp.y = lastProp.y + growDirY * dist;
        props.push(bodyProp);
        lastProp = bodyProp;
    }
    const leader = props[leaderIndex];
    const resolvedGroupId = spawnGroupId ?? `${exportType ?? "agentChain"}:${leader.id}`;
    for (let i = 0; i < props.length; i++) {
        meta.setSpawnGroupId(props[i].id, resolvedGroupId);
        if (exportType) meta.setSpawnGroupExportType(props[i].id, exportType);
    }
    meta.setSpawnGroupAnchor(leader.id);
    for (let i = 0; i < props.length - 1; i++) {
        const a = props[i];
        const b = props[i + 1];
        const segDist = Math.hypot(b.x - a.x, b.y - a.y);
        const restLength = spacing != null ? segDist * linkSlack : segDist;
        addChainLink(state, a.id, b.id, linkSlack, restLength);
    }
    setChainHead(state, meta, leader.id);
    return { leader, leaderIndex, head: props[0], tail: props[props.length - 1], members: props, spawnGroupId: resolvedGroupId };
}

// --- MERGED FROM spawnLinkedBallChain.js ---
function segmentOffset(index, spacing, growDirX, growDirY) {
    return { x: index * spacing * growDirX, y: index * spacing * growDirY };
}
export function spawnLinkedBallChain(state, anchorIdx, options) {
    return spawnAgentChain(state, anchorIdx, {
        leaderIndex: 0,
        headPropId: options.headBallType ?? options.ballType,
        bodyPropId: options.ballType,
        segmentCount: options.segmentCount,
        faction: options.faction ?? sandboxFactions.alpha,
        exportType: options.exportType,
        linkSlack: options.linkSlack,
        segmentRadius: options.segmentRadius,
        growDirX: options.growDirX ?? -1,
        growDirY: options.growDirY ?? 0,
        spacing: options.spacing,
        spawnGroupId: options.spawnGroupId,
    });
}
export function growChainSegment(state, tailProp, options) {
    const spacing = options.spacing;
    const ballType = options.ballType;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    const faction = options.faction ?? resolveSandboxFaction(tailProp);
    const exportType = options.exportType ?? null;
    const meta = getSandboxEntityMeta(state);
    const spawnGroupId = options.spawnGroupId ?? meta.getSpawnGroupId(tailProp.id);
    const linkSlack = options.linkSlack ?? 1;
    const segmentRadius = options.segmentRadius ?? null;
    const offset = segmentOffset(1, spacing, growDirX, growDirY);
    const segment = spawnPlacedSandboxProp(state, tailProp.x + offset.x, tailProp.y + offset.y, ballType, faction);
    if (segmentRadius != null) setPropRadius(segment, segmentRadius);
    if (spawnGroupId) {
        meta.setSpawnGroupId(segment.id, spawnGroupId);
        if (exportType) meta.setSpawnGroupExportType(segment.id, exportType);
    }
    addChainLink(state, tailProp.id, segment.id, linkSlack);
    return segment;
}
export function linkedChainOccupiedCellIndices(members, grid) {
    const indices = new Set();
    for (let i = 0; i < members.length; i++) {
        const col = grid.worldCol(members[i].x);
        const row = grid.worldRow(members[i].y);
        indices.add(row * grid.cols + col);
    }
    return indices;
}
export function tryExportLinkedBallChainSpawnGroup(members, meta) {
    const exportType = meta.getSpawnGroupExportType(members[0].id);
    if (!exportType) return null;
    const anchor = members.find((prop) => meta.isSpawnGroupAnchor(prop.id)) ?? members[0];
    return { type: exportType, x: anchor.x, y: anchor.y, facing: anchor.facing, faction: resolveSandboxFaction(anchor), segmentCount: members.length };
}

// --- MERGED FROM spawnPoolRack.js ---
const PLAYFIELD_W = 80;
const PLAYFIELD_H = 160;
const APEX_U = 0.5;
const APEX_V = 0.2933012701892219;
const CUE_BEHAVIOR_OVERRIDES = {
    cueStrike: { minDrag: 0.75, maxPull: 18.75, pullScale: 0.5, minPower: 4, maxPower: 800, powerCurve: 2.5 },
    inputGates: {
        cueStrike: [
            { scope: "self", until: "atRest" },
            { scope: "groupWorldProps", link: "spawnGroupId", until: "allAtRest" },
        ],
    },
};
/** @typedef {{ prop: string, u: number, v: number }} RackBallPlacement */
/** @type {RackBallPlacement[]} */
const RACK_9BALL = [
    { prop: "pool_cue_ball", u: 0.5, v: 0.75 },
    { prop: "pool_ball_1", u: 0.5, v: 0.2933012701892219 },
    { prop: "pool_ball_2", u: 0.45, v: 0.25 },
    { prop: "pool_ball_3", u: 0.55, v: 0.25 },
    { prop: "pool_ball_4", u: 0.4, v: 0.20669872981077808 },
    { prop: "pool_ball_9", u: 0.5, v: 0.20669872981077808 },
    { prop: "pool_ball_5", u: 0.6, v: 0.20669872981077808 },
    { prop: "pool_ball_7", u: 0.45, v: 0.16339745962155616 },
    { prop: "pool_ball_8", u: 0.55, v: 0.16339745962155616 },
    { prop: "pool_ball_6", u: 0.5, v: 0.12009618943233424 },
];
/** @type {RackBallPlacement[]} */
const RACK_8BALL = [
    { prop: "pool_cue_ball", u: 0.5, v: 0.75 },
    { prop: "pool_ball_1", u: 0.5, v: 0.2933012701892219 },
    { prop: "pool_ball_10", u: 0.45, v: 0.25 },
    { prop: "pool_ball_2", u: 0.55, v: 0.25 },
    { prop: "pool_ball_11", u: 0.4, v: 0.20669872981077808 },
    { prop: "pool_ball_8", u: 0.5, v: 0.20669872981077808 },
    { prop: "pool_ball_3", u: 0.6, v: 0.20669872981077808 },
    { prop: "pool_ball_12", u: 0.35, v: 0.16339745962155616 },
    { prop: "pool_ball_4", u: 0.45, v: 0.16339745962155616 },
    { prop: "pool_ball_13", u: 0.55, v: 0.16339745962155616 },
    { prop: "pool_ball_5", u: 0.65, v: 0.16339745962155616 },
    { prop: "pool_ball_6", u: 0.3, v: 0.12009618943233424 },
    { prop: "pool_ball_14", u: 0.4, v: 0.12009618943233424 },
    { prop: "pool_ball_7", u: 0.5, v: 0.12009618943233424 },
    { prop: "pool_ball_15", u: 0.6, v: 0.12009618943233424 },
    { prop: "pool_ball_9", u: 0.7, v: 0.12009618943233424 },
];
/** @param {number} u @param {number} v */
function rackOffset(u, v) {
    return { dx: (u - APEX_U) * PLAYFIELD_W, dy: (v - APEX_V) * PLAYFIELD_H };
}
/**
 * @param {object} state
 * @param {number} anchorX — foot spot / apex ball (ball 1) world X
 * @param {number} anchorY
 * @param {"8ball" | "9ball"} variant
 * @param {string} faction
 */
/** @param {"8ball" | "9ball"} variant */
function poolRackExportType(variant) {
    return variant === "9ball" ? "pool_rack_9ball" : "pool_rack_8ball";
}
/**
 * @param {object[]} members
 * @param {import("../../GameState/sandboxEntityMeta.js").SandboxEntityMetaStore} meta
 * @returns {{ type: string, x: number, y: number, facing: number, faction: string } | null}
 */
export function tryExportPoolRackSpawnGroup(members, meta) {
    const exportType = meta.getSpawnGroupExportType(members[0].id);
    if (!exportType) return null;
    const anchor = members.find((prop) => meta.isSpawnGroupAnchor(prop.id)) ?? members[0];
    return { type: exportType, x: anchor.x, y: anchor.y, facing: anchor.facing, faction: resolveSandboxFaction(anchor) };
}
export function spawnPoolRack(state, anchorX, anchorY, variant, faction) {
    const layout = variant === "9ball" ? RACK_9BALL : RACK_8BALL;
    const spawnGroupId = `poolRack:${Date.now()}`;
    const exportType = poolRackExportType(variant);
    const meta = getSandboxEntityMeta(state);
    let cueProp = null;
    for (let i = 0; i < layout.length; i++) {
        const entry = layout[i];
        const { dx, dy } = rackOffset(entry.u, entry.v);
        const prop = new WorldProp(anchorX + dx, anchorY + dy, entry.prop, 0);
        prop.faction = faction;
        meta.setSpawnGroupId(prop.id, spawnGroupId);
        meta.setSpawnGroupExportType(prop.id, exportType);
        if (entry.prop === "pool_ball_1") meta.setSpawnGroupAnchor(prop.id);
        if (entry.prop === "pool_cue_ball") {
            meta.setBehaviorOverrides(prop.id, CUE_BEHAVIOR_OVERRIDES);
            meta.setActiveBehaviorId(prop.id, CUE_STRIKE_BEHAVIOR_ID);
            cueProp = prop;
        }
        wakeKineticBody(prop);
        addWorldPropToState(state, prop);
    }
    return cueProp;
}

// --- MERGED FROM dragLaunch.js ---
/** @typedef {{ minDrag: number, maxPull: number, pullScale: number, minPower: number, maxPower: number, powerCurve?: number }} DragLaunchConfig */
/** @typedef {{ active: boolean, anchorX: number, anchorY: number, startX: number, startY: number, pullX: number, pullY: number, shotNx: number | null, shotNy: number | null }} DragLaunchAim */
export const DRAG_LAUNCH_DEFAULTS = { minDrag: 10, maxPull: 110, pullScale: 1.25, minPower: 55, maxPower: 340 };
/** @param {object | null | undefined} asset */
export function getDragLaunchConfig(asset) {
    const entry = asset?.sandbox?.dragLaunch;
    const overrides = entry === true ? {} : entry && typeof entry === "object" ? entry : {};
    return { ...DRAG_LAUNCH_DEFAULTS, ...overrides };
}
/** @param {number} anchorX @param {number} anchorY @param {number} [startX] @param {number} [startY] @returns {DragLaunchAim} */
export function createDragLaunchAim(anchorX, anchorY, startX = anchorX, startY = anchorY) {
    return { active: true, anchorX, anchorY, startX, startY, pullX: startX, pullY: startY, shotNx: null, shotNy: null };
}
/** @param {DragLaunchAim} aim @param {DragLaunchConfig} config */
function resolveDragAimPhysics(aim, config) {
    const startX = aim.startX ?? aim.anchorX;
    const startY = aim.startY ?? aim.anchorY;
    const dx = aim.pullX - startX;
    const dy = aim.pullY - startY;
    const { nx, ny, len: drag } = normalizeXY(dx, dy);
    if (drag < 0.5) {
        if (aim.shotNx == null || aim.shotNy == null) return null;
        return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag: 0, pullBack: 0 };
    }
    aim.shotNx = -nx;
    aim.shotNy = -ny;
    const pullBack = Math.min(config.maxPull, drag * config.pullScale);
    return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag, pullBack };
}
/** @param {number} drag @param {DragLaunchConfig} config @returns {number} 0–1 pull amount after minDrag */
export function resolveDragLaunchPullRatio(drag, config) {
    if (drag < config.minDrag) return 0;
    const maxFingerDrag = config.maxPull / config.pullScale;
    const span = Math.max(0.001, maxFingerDrag - config.minDrag);
    return Math.min(1, (drag - config.minDrag) / span);
}
/** @param {number} drag @param {DragLaunchConfig} config */
function computeLaunchPower(drag, config) {
    const pullRatio = resolveDragLaunchPullRatio(drag, config);
    if (pullRatio <= 0) return 0;
    const exponent = config.powerCurve ?? 1;
    const curved = exponent === 1 ? pullRatio : Math.pow(pullRatio, exponent);
    const minPower = config.minPower;
    const maxPower = config.maxPower;
    return minPower + curved * (maxPower - minPower);
}
/** @param {DragLaunchAim | null | undefined} aim @param {number} pullX @param {number} pullY @param {DragLaunchConfig} config */
export function updateDragLaunchAim(aim, pullX, pullY, config) {
    if (!aim?.active) return null;
    aim.pullX = pullX;
    aim.pullY = pullY;
    return resolveDragAimPhysics(aim, config);
}
/** @param {DragLaunchAim | null | undefined} aim @param {DragLaunchConfig} config */
export function getDragLaunchPreview(aim, config) {
    if (!aim?.active) return null;
    const physics = resolveDragAimPhysics(aim, config);
    if (!physics || aim.shotNx == null || aim.shotNy == null) return null;
    const startX = aim.startX ?? aim.anchorX;
    const startY = aim.startY ?? aim.anchorY;
    const dx = aim.pullX - startX;
    const dy = aim.pullY - startY;
    return {
        anchorX: aim.anchorX,
        anchorY: aim.anchorY,
        pullX: aim.anchorX + dx,
        pullY: aim.anchorY + dy,
        nx: physics.shotNx,
        ny: physics.shotNy,
        power: computeLaunchPower(physics.drag, config),
        drag: physics.drag,
    };
}
/**
 * @param {DragLaunchAim | null | undefined} aim
 * @param {DragLaunchConfig} config
 * @returns {{ anchorX: number, anchorY: number, nx: number, ny: number, power: number } | null}
 */
export function releaseDragLaunch(aim, config) {
    if (!aim?.active) return null;
    const physics = resolveDragAimPhysics(aim, config);
    if (!physics || physics.drag < config.minDrag || aim.shotNx == null || aim.shotNy == null) return null;
    const power = computeLaunchPower(physics.drag, config);
    if (power <= 0) return null;
    return { anchorX: aim.anchorX, anchorY: aim.anchorY, nx: aim.shotNx, ny: aim.shotNy, power };
}
/**
 * @param {object} prop
 * @param {object | null | undefined} state
 */
export function buildDragLaunchAimLineContext(prop, state) {
    if (!state || !prop) return null;
    const grid = state.obstacleGrid;
    const maxRayDist = resolveCueStrikeMaxRayDist({ obstacleGrid: grid });
    return { prop, radius: prop.radius, maxRayDist };
}
/**
 * @param {ReturnType<typeof getDragLaunchPreview>} preview
 * @param {ReturnType<typeof buildDragLaunchAimLineContext>} aimLineContext
 */
export function getDragLaunchAimLine(preview, aimLineContext) {
    if (!preview || preview.power <= 0 || !aimLineContext) return null;
    const travelDist = estimateRollingTravelDistance(preview.power, aimLineContext.prop?.strategy ?? {});
    return computeCircleAimLineSegment({
        originX: preview.anchorX,
        originY: preview.anchorY,
        radius: aimLineContext.radius,
        nx: preview.nx,
        ny: preview.ny,
        maxTravelDist: travelDist,
        maxRayDist: aimLineContext.maxRayDist,
    });
}
/** @param {object} body @param {number} nx @param {number} ny @param {number} power */
export function applyDragLaunchVelocity(body, nx, ny, power) {
    body.vx = nx * power;
    body.vy = ny * power;
    if (body.strategy?.rolls) {
        const r = body.radius || 8;
        body.angularVelocity = (power / r) * 0.12;
    }
    wakeKineticBody(body);
}
/**
 * Shared pointer-drag aim + launch for sandbox behaviors.
 *
 * @param {{
 *   id: string,
 *   getConfig?: (prop: object) => DragLaunchConfig,
 *   canStart?: (prop: object, world: { x: number, y: number }) => boolean,
 *   onLaunch?: (prop: object, shot: { anchorX: number, anchorY: number, nx: number, ny: number, power: number }) => void,
 *   onAim?: (prop: object, aim: DragLaunchAim) => void,
 *   buildAimLineContext?: (prop: object) => ReturnType<typeof buildDragLaunchAimLineContext>,
 *   resolveAimLine?: typeof getDragLaunchAimLine,
 * }} spec
 * @returns {import("./sandboxCapabilities.js").SandboxBehavior}
 */
export function createDragLaunchInteraction(spec) {
    /** @type {DragLaunchAim | null} */
    let aim = null;
    const buildCtx = spec.buildAimLineContext ?? (() => null);
    const resolveLine = spec.resolveAimLine ?? getDragLaunchAimLine;
    return {
        id: spec.id,
        onPointerDown(prop, world, _e) {
            if (spec.canStart && !spec.canStart(prop, world)) return false;
            wakeKineticBody(prop);
            aim = createDragLaunchAim(prop.x, prop.y, world.x, world.y);
            updateDragLaunchAim(aim, world.x, world.y, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop));
            spec.onAim?.(prop, aim);
            return true;
        },
        onPointerMove(prop, world, _e) {
            if (!aim?.active) return;
            updateDragLaunchAim(aim, world.x, world.y, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop));
            spec.onAim?.(prop, aim);
        },
        onPointerUp(prop, _e) {
            if (!aim?.active) return;
            const shot = releaseDragLaunch(aim, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop));
            aim = null;
            if (!shot) return;
            if (spec.onLaunch) spec.onLaunch(prop, shot);
            else applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
        },
        appendOverlayCommands(commands, prop) {
            if (!aim?.active) return;
            appendDragLaunchOverlayCommands(commands, aim, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop), buildCtx(prop), resolveLine);
        },
        reset() {
            aim = null;
        },
    };
}
export const DRAG_LAUNCH_BEHAVIOR_ID = "dragLaunch";
export const DRAG_LAUNCH_WAIT_BEHAVIOR_ID = "dragLaunchWait";
/** @param {object} prop */
function dragLaunchConfigForProp(prop) {
    return getDragLaunchConfig(propCatalog[prop?.type]);
}
/** @param {object} state @returns {(prop: object) => ReturnType<typeof buildDragLaunchAimLineContext>} */
export function dragLaunchAimLineContextForState(state) {
    return (prop) => buildDragLaunchAimLineContext(prop, state);
}
/** @param {object} state @returns {import("./sandboxCapabilities.js").SandboxBehavior} */
export function createDragLaunchBehavior(state) {
    return createDragLaunchInteraction({ id: DRAG_LAUNCH_BEHAVIOR_ID, getConfig: dragLaunchConfigForProp, buildAimLineContext: dragLaunchAimLineContextForState(state) });
}
/** @param {object} state @returns {import("./sandboxCapabilities.js").SandboxBehavior} */
export function createDragLaunchWaitBehavior(state) {
    return createDragLaunchInteraction({
        id: DRAG_LAUNCH_WAIT_BEHAVIOR_ID,
        getConfig: dragLaunchConfigForProp,
        buildAimLineContext: dragLaunchAimLineContextForState(state),
        canStart(prop) {
            if (!isEntityAtRest(prop)) return false;
            return evaluateInputGates(DRAG_LAUNCH_WAIT_BEHAVIOR_ID, prop, propCatalog[prop?.type], state).allowed;
        },
    });
}
export function appendDragLaunchOverlayCommands(commands, aim, config, aimLineContext = null, resolveAimLine = getDragLaunchAimLine) {
    const preview = getDragLaunchPreview(aim, config);
    if (!preview) return;
    const ratio = config.maxPower > config.minPower ? Math.max(0, Math.min(1, (preview.power - config.minPower) / (config.maxPower - config.minPower))) : 0;
    const hue = 180 - ratio * 180;
    const startX = aim?.startX ?? preview.anchorX;
    const startY = aim?.startY ?? preview.anchorY;
    const maxFingerDrag = config.maxPull / config.pullScale;
    commands.push(overlayCircleStroke(startX, startY, maxFingerDrag, { stroke: `hsla(${hue}, 90%, 55%, 0.15)`, lineWidth: 1, dash: [4, 4] }));
    if (aim && aim.pullX != null && aim.pullY != null) {
        commands.push(overlaySegment(startX, startY, aim.pullX, aim.pullY, { stroke: `hsla(${hue}, 90%, 55%, 0.12)`, lineWidth: 1, dash: [3, 3] }));
        commands.push(overlayCircleFillStroke(aim.pullX, aim.pullY, 4, { fill: `hsla(${hue}, 90%, 55%, 0.35)`, stroke: `hsla(${hue}, 90%, 55%, 0.85)`, lineWidth: 1.5 }));
    }
    if (Math.hypot(startX - preview.anchorX, startY - preview.anchorY) > 0.1) {
        commands.push(overlayCircleStroke(startX, startY, 5, { stroke: `hsla(${hue}, 90%, 55%, 0.4)`, lineWidth: 1.5 }));
        commands.push(overlayCircleFillStroke(startX, startY, 1.5, { fill: `hsla(${hue}, 90%, 55%, 0.65)`, stroke: `hsla(${hue}, 90%, 55%, 0.65)`, lineWidth: 1 }));
    }
    commands.push(overlaySegment(preview.pullX, preview.pullY, preview.anchorX, preview.anchorY, { stroke: `hsla(${hue}, 90%, 55%, 0.4)`, lineWidth: 2, dash: [6, 4] }));
    commands.push(overlayCircleStroke(preview.anchorX, preview.anchorY, 7, { stroke: `hsla(${hue}, 100%, 60%, 0.85)`, lineWidth: 2 }));
    if (preview.power <= 0) return;
    const aimLine = resolveAimLine(preview, aimLineContext);
    if (!aimLine) return;
    commands.push(overlayAimSegment(aimLine.x1, aimLine.y1, aimLine.x2, aimLine.y2, { color: `hsl(${hue}, 100%, 50%)`, lineWidth: 3, glowHue: hue }));
}

// --- MERGED FROM chainLinks.js ---
export function isChainLinkBall(prop) {
    if (!prop?.strategy?.isKinetic) return false;
    if (prop.strategy?.canChain) return true;
    return sandboxAssetMatchesTagFilter(propCatalog[prop.type], "nav");
}
export function hasChainMembership(state, propId) {
    const list = listKineticConstraints(state.kinetic);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.bodyAId === propId || entry.bodyBId === propId) return true;
    }
    return false;
}
export function isChainSteeringTarget(state, entityMeta, propId) {
    if (entityMeta.isChainHead(propId)) return true;
    if (hasChainMembership(state, propId)) return false;
    const prop = state.entityRegistry.getLive(propId);
    if (!prop || prop.isDead) return false;
    return isChainLinkBall(prop);
}
export function getChainMemberIds(state, propId) {
    return getConnectedBodyIds(state.kinetic, propId);
}
export function setChainHead(state, entityMeta, propId) {
    const members = getChainMemberIds(state, propId);
    for (let i = 0; i < members.length; i++) entityMeta.setChainHead(members[i], false);
    entityMeta.setChainHead(propId, true);
}
export function hasChainLinkBetween(state, bodyAId, bodyBId) {
    const list = listKineticConstraints(state.kinetic);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if ((entry.bodyAId === bodyAId && entry.bodyBId === bodyBId) || (entry.bodyAId === bodyBId && entry.bodyBId === bodyAId)) return true;
    }
    return false;
}
export function findDistanceConstraintBetween(state, bodyAId, bodyBId) {
    const list = listKineticConstraints(state.kinetic);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if ((entry.bodyAId === bodyAId && entry.bodyBId === bodyBId) || (entry.bodyAId === bodyBId && entry.bodyBId === bodyAId)) return entry;
    }
    return null;
}
export function getOrderedChainMemberIds(state, headId) {
    return getConnectedComponentPath(state.kinetic, headId);
}
export function removeChainLinkBetween(state, bodyAId, bodyBId) {
    const entry = findDistanceConstraintBetween(state, bodyAId, bodyBId);
    if (!entry) return false;
    removeKineticConstraint(state.kinetic, entry.id);
    return true;
}
export function clearChainLinksForMembers(state, memberIds) {
    const members = new Set(memberIds);
    const list = listKineticConstraints(state.kinetic);
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if (members.has(entry.bodyAId) && members.has(entry.bodyBId)) removeKineticConstraint(state.kinetic, entry.id);
    }
}
export function addChainLink(state, fromPropId, toPropId, linkSlack = 1, restLengthOverride = null) {
    if (fromPropId === toPropId) return false;
    const bodyA = state.entityRegistry.getLive(fromPropId);
    const bodyB = state.entityRegistry.getLive(toPropId);
    if (!isChainLinkBall(bodyA) || !isChainLinkBall(bodyB)) return false;
    if (hasChainLinkBetween(state, fromPropId, toPropId)) return true;
    const restLength = restLengthOverride != null ? restLengthOverride : resolveChainLinkRestLength(bodyA, bodyB, linkSlack);
    addDistanceConstraint(state.kinetic, { bodyA, bodyB, restLength });
    return true;
}
export function resolveChainLinkRestLength(bodyA, bodyB, linkSlack) {
    return (bodyA.radius + bodyB.radius) * linkSlack;
}
export function resyncChainLinkRestLengths(state, memberIds, linkSlack) {
    const members = new Set(memberIds);
    const list = listKineticConstraints(state.kinetic);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if (!members.has(entry.bodyAId) || !members.has(entry.bodyBId)) continue;
        const bodyA = entry.bodyA;
        const bodyB = entry.bodyB;
        if (bodyA.isDead || bodyB.isDead) continue;
        entry.restLength = resolveChainLinkRestLength(bodyA, bodyB, linkSlack);
    }
}
export function listChainLinkEndpoints(state, propId) {
    const list = listKineticConstraints(state.kinetic);
    const endpoints = [];
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if (entry.bodyAId !== propId && entry.bodyBId !== propId) continue;
        const target = entry.bodyAId === propId ? entry.bodyB : entry.bodyA;
        if (target.isDead) continue;
        endpoints.push({ constraintId: entry.id, targetId: target.id, label: `${formatPropTypeLabel(target.type)} · #${target.id}`, x: target.x, y: target.y });
    }
    return endpoints;
}
export function clearChainLinksForProp(state, propId) {
    const list = listKineticConstraints(state.kinetic);
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.bodyAId === propId || entry.bodyBId === propId) removeKineticConstraint(state.kinetic, entry.id);
    }
}
export function resolveGroundNavSteeringProp(state, entityMeta, propIds) {
    for (let i = 0; i < propIds.length; i++) if (entityMeta.isChainHead(propIds[i])) return state.entityRegistry.getLive(propIds[i]);
    for (let i = 0; i < propIds.length; i++) if (isChainSteeringTarget(state, entityMeta, propIds[i])) return state.entityRegistry.getLive(propIds[i]);
    return null;
}
export function findChainHeadProp(state) {
    const meta = getSandboxEntityMeta(state);
    return findLiveWorldProp(state.worldProps, (prop) => meta.isChainHead(prop.id));
}
export function appendChainLinkWireOverlayCommands(out, state, { wireFromPropId = null, wireCursor = null } = {}) {
    if (wireFromPropId != null && wireCursor) {
        const from = state.entityRegistry.getLive(wireFromPropId);
        if (from) appendOverlayWireLink(out, from.x, from.y, wireCursor.x, wireCursor.y, "#81D4FA", { live: true, lineWidth: 2, dash: [5, 4] });
    }
}
// --- MERGED FROM navigation ground nav ---
// --- MERGED FROM directGroundNavBehavior.js ---
export function createDirectGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, unitDragActive: false, moveTargetActive: false };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run) => {
        run.targetWorld = null;
        run.unitDragActive = false;
        run.moveTargetActive = false;
    };
    const tickProp = (prop, run, dt) => {
        if (!run.targetWorld || (!run.unitDragActive && !run.moveTargetActive)) return;
        const config = getKineticRollConfig(prop);
        const dx = run.targetWorld.x - prop.x;
        const dy = run.targetWorld.y - prop.y;
        const dist = Math.hypot(dx, dy);
        if (dist < config.stopRadius) {
            if (run.moveTargetActive) {
                clearGroundRollDrive(prop);
                clearRunTarget(run);
                return;
            }
            decelerateRoll(prop, config);
            return;
        }
        steerRollToward(prop, dx / dist, dy / dist, config);
    };
    return {
        id: DIRECT_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            const run = getRun(prop);
            run.unitDragActive = true;
            run.moveTargetActive = false;
            run.targetWorld = { x: world.x, y: world.y };
            return true;
        },
        onPointerMove(prop, world) {
            const run = getRun(prop);
            if (!run.unitDragActive) return;
            run.targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp(prop) {
            const run = getRun(prop);
            run.unitDragActive = false;
            if (!run.moveTargetActive) {
                clearGroundRollDrive(prop);
                clearRunTarget(run);
            }
        },
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            run.unitDragActive = false;
            run.moveTargetActive = true;
            run.targetWorld = { x: world.x, y: world.y };
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.moveTargetActive || !run.targetWorld) return;
            run.targetWorld = { x: world.x, y: world.y };
        },
        hasMoveTarget(prop) {
            const run = getRun(prop);
            return run.moveTargetActive && run.targetWorld != null;
        },
        clearMoveTarget(prop) {
            clearGroundRollDrive(prop);
            clearRunTarget(getRun(prop));
        },
        tick(prop, dt) {
            tickProp(prop, getRun(prop), dt);
        },
        tickWorld(dt) {
            propRuns.forEach((run, propId) => {
                if (!run.targetWorld || (!run.unitDragActive && !run.moveTargetActive)) return;
                const prop = state.entityRegistry.getLive(propId);
                if (!prop) {
                    propRuns.delete(propId);
                    return;
                }
                tickProp(prop, run, dt);
            });
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            if (!run?.targetWorld || (!run.unitDragActive && !run.moveTargetActive)) return null;
            return {
                mode: "direct",
                pathNodes: [
                    { x: prop.x, y: prop.y },
                    { x: run.targetWorld.x, y: run.targetWorld.y },
                ],
            };
        },
        reset() {
            propRuns.clear();
        },
    };
}
// --- MERGED FROM driveGroundNav.js ---
const SCRATCH_STEER_TARGET = { x: 0, y: 0 };
/**
 * @param {object} prop
 * @param {{ x: number, y: number }} targetWorld
 * @param {number | null} targetCellCol
 * @param {number | null} targetCellRow
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} stopRadius
 */
export function groundNavArrivedAtTarget(prop, targetWorld, targetCellCol, targetCellRow, grid, stopRadius) {
    const onBelt = FloorBelt.isEntityOnBelt(grid, prop.x, prop.y);
    const targetOnBelt = targetCellCol != null && targetCellRow != null && FloorBelt.isBeltAtIdx(grid, targetCellCol + targetCellRow * grid.cols);
    const dist = Math.hypot(targetWorld.x - prop.x, targetWorld.y - prop.y);
    return dist <= stopRadius && (!targetOnBelt || onBelt);
}
const HPA_PATH_SETTINGS_SCRATCH = {};
/** @param {object} state @param {object} prop @param {number} stopRadius */
export function buildHpaGroundNavPathSettings(state, prop, stopRadius) {
    const hpaNav = physicsSettings.groundNavHpa;
    const settings = Object.assign(HPA_PATH_SETTINGS_SCRATCH, state.nav.settings);
    settings.pathWaypointArrival = Math.max(hpaNav.pathWaypointArrivalMin, (prop.radius ?? 6) * hpaNav.pathWaypointArrivalRadiusFactor);
    settings.arrivalDistance = stopRadius;
    return settings;
}
/**
 * HPA ground-nav tick — belt handoff + session replan/steer loop.
 * @param {{
 *   prop: object,
 *   targetWorld: { x: number, y: number },
 *   targetCellCol?: number | null,
 *   targetCellRow?: number | null,
 *   nav: ReturnType<import("./hpaGroundNavSession.js").createHpaGroundNavSession>,
 *   beltWasOnBelt: boolean,
 *   beltHandoffCooldown?: { frames: number },
 *   state: object,
 *   dtMs: number,
 *   pathSettings: object,
 * }} opts
 * @returns {{ vx: number, vy: number, steering: object | null, replanReason: string | null, beltWasOnBelt: boolean }}
 */
export function driveGroundNav({ prop, targetWorld, targetCellCol = null, targetCellRow = null, nav, beltWasOnBelt, beltHandoffCooldown, state, dtMs, pathSettings }) {
    const grid = state.obstacleGrid;
    if (FloorBelt.isEntityOnBelt(grid, prop.x, prop.y)) return { vx: 0, vy: 0, steering: null, replanReason: null, beltWasOnBelt: true };
    const steerTarget = snapNavGoalWorldInto(SCRATCH_STEER_TARGET, grid, prop.x, prop.y, targetWorld.x, targetWorld.y);
    if (beltWasOnBelt) {
        const cooldownFrames = beltHandoffCooldown.frames;
        if (cooldownFrames > 0) {
            beltHandoffCooldown.frames = cooldownFrames - 1;
            return { vx: 0, vy: 0, steering: null, replanReason: null, beltWasOnBelt: false };
        }
        nav.reset(state);
        nav.replan(prop, steerTarget.x, steerTarget.y, state);
        beltHandoffCooldown.frames = state.nav.settings.stuckReplanFrames;
        return { vx: 0, vy: 0, steering: null, replanReason: "beltHandoff", beltWasOnBelt: false };
    }
    const { steering, replanReason } = nav.update(prop, steerTarget.x, steerTarget.y, state, dtMs, pathSettings);
    return { vx: steering?.desiredX ?? 0, vy: steering?.desiredY ?? 0, steering, replanReason, beltWasOnBelt: false };
}
// --- MERGED FROM flowGroundNavBehavior.js ---
const FLOW_OVERLAY_DIR_SCRATCH = { x: 0, y: 0 };
const FLOW_DIR_SCRATCH = { x: 0, y: 0 };
function computeFlowFieldSteering(pose, targetX, targetY, flowFieldGrid) {
    const flowField = flowFieldGrid.getReadyFlowField(targetX, targetY);
    if (!flowField) return null;
    const dir = sampleFlowDirectionInto(FLOW_DIR_SCRATCH, pose.x, pose.y, flowField, flowFieldGrid.frame);
    if (!dir) return null;
    return { desiredX: dir.x, desiredY: dir.y };
}
export function createFlowGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, dragging: false, lastTopologyKey: "" };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run) => {
        run.targetWorld = null;
        run.dragging = false;
        run.lastTopologyKey = "";
    };
    const applyMoveTarget = (run, world) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        run.targetWorld = snapped.world;
    };
    const resolveSteerTarget = (run, prop) => snapNavGoalWorldInto(SCRATCH_STEER_TARGET, state.obstacleGrid, prop.x, prop.y, run.targetWorld.x, run.targetWorld.y);
    const syncFlowWindow = (prop, steerTarget) => {
        state.flowFieldGrid.ensureRollTargetWindow(prop.x, prop.y, steerTarget.x, steerTarget.y, state.nav.settings.recenterThreshold);
    };
    const tickProp = (prop, run, dt) => {
        if (!run.targetWorld) return;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        const steerTarget = resolveSteerTarget(run, prop);
        const flowFieldGrid = state.flowFieldGrid;
        const topologyKey = state.nav.topologyKey();
        if (topologyKey !== run.lastTopologyKey) {
            run.lastTopologyKey = topologyKey;
            flowFieldGrid.refresh();
        }
        syncFlowWindow(prop, steerTarget);
        const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
        if (distToTarget <= config.stopRadius) {
            clearGroundRollDrive(prop);
            clearRunTarget(run);
            return;
        }
        const steering = computeFlowFieldSteering(agentPose(prop), steerTarget.x, steerTarget.y, flowFieldGrid);
        if (!steering) return;
        steerRollToward(prop, steering.desiredX, steering.desiredY, config);
    };
    return {
        id: FLOW_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            const run = getRun(prop);
            run.dragging = true;
            applyMoveTarget(run, world);
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
            return true;
        },
        onPointerMove(prop, world) {
            const run = getRun(prop);
            if (!run.dragging || !run.targetWorld) return;
            applyMoveTarget(run, world);
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
        },
        onPointerUp(prop) {
            getRun(prop).dragging = false;
        },
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            run.dragging = false;
            applyMoveTarget(run, world);
            if (!run.targetWorld) return;
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            applyMoveTarget(run, world);
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
        },
        tick(prop, dt) {
            tickProp(prop, getRun(prop), dt);
        },
        tickWorld(dt) {
            propRuns.forEach((run, propId) => {
                if (!run.targetWorld) return;
                const prop = state.entityRegistry.getLive(propId);
                if (!prop) {
                    propRuns.delete(propId);
                    return;
                }
                tickProp(prop, run, dt);
            });
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            if (!run?.targetWorld) return null;
            const steerTarget = resolveSteerTarget(run, prop);
            const flowField = state.flowFieldGrid.getReadyFlowField(steerTarget.x, steerTarget.y);
            let dirX = null;
            let dirY = null;
            if (flowField) {
                const dir = sampleFlowDirectionInto(FLOW_OVERLAY_DIR_SCRATCH, prop.x, prop.y, flowField, state.flowFieldGrid.frame);
                if (dir) {
                    dirX = dir.x;
                    dirY = dir.y;
                }
            }
            return { mode: "flow", propX: prop.x, propY: prop.y, propRadius: prop.radius ?? 8, dirX, dirY, targetX: steerTarget.x, targetY: steerTarget.y };
        },
        reset() {
            propRuns.clear();
        },
    };
}
// --- MERGED FROM groundNavSelectionMenu.js ---
export const GROUND_NAV_SELECTION_MOVE_IDS = [HPA_GROUND_NAV_BEHAVIOR_ID, FLOW_GROUND_NAV_BEHAVIOR_ID];
export function isSandboxNavPropAsset(asset) {
    return sandboxAssetMatchesTagFilter(asset, "nav");
}
export function countNavPropsInSelection(state, propIds, entityMeta = null) {
    let count = 0;
    for (let i = 0; i < propIds.length; i++) {
        const prop = state.entityRegistry.getLive(propIds[i]);
        if (!prop || prop.isDead) continue;
        if (!isSandboxNavPropAsset(propCatalog[prop.type])) continue;
        if (entityMeta && !isChainSteeringTarget(state, entityMeta, prop.id)) continue;
        count++;
    }
    return count;
}
export function issueGroundNavToSelection(state, { propIds, behaviorId, world, behaviorById, entityMeta }) {
    const behavior = behaviorById.get(behaviorId);
    if (!behavior?.setMoveTarget) return 0;
    let moved = 0;
    for (let i = 0; i < propIds.length; i++) {
        const prop = state.entityRegistry.getLive(propIds[i]);
        if (!prop || prop.isDead) continue;
        if (!isSandboxNavPropAsset(propCatalog[prop.type])) continue;
        if (!isChainSteeringTarget(state, entityMeta, prop.id)) continue;
        entityMeta.setActiveBehaviorId(prop.id, behaviorId);
        behavior.setMoveTarget(prop, world);
        moved++;
    }
    return moved;
}
export function buildGroundNavSelectionMenuActions({ propIds, world, navCount, issueGroundNav }) {
    if (navCount === 0) return [];
    const actions = [];
    for (let i = 0; i < GROUND_NAV_SELECTION_MOVE_IDS.length; i++) {
        const behaviorId = GROUND_NAV_SELECTION_MOVE_IDS[i];
        actions.push({ label: `${getSandboxBehaviorLabel(behaviorId)} (${navCount})`, onClick: () => issueGroundNav({ propIds, behaviorId, world }) });
    }
    return actions;
}
// --- MERGED FROM hpaGroundNavBehavior.js ---
export function createHpaGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, targetCellCol: null, targetCellRow: null, dragging: false, wasOnBelt: false, beltHandoffCooldown: { frames: 0 }, hpaNav: new HpaNavSession() };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run, state) => {
        run.targetWorld = null;
        run.targetCellCol = null;
        run.targetCellRow = null;
        run.dragging = false;
        run.wasOnBelt = false;
        run.beltHandoffCooldown.frames = 0;
        run.hpaNav.reset(state);
    };
    const releaseMoveTarget = (prop, run) => {
        clearGroundRollDrive(prop);
        clearRunTarget(run, state);
    };
    const applyMoveTarget = (run, world, forceReset = false) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        const cellChanged = snapped.col !== run.targetCellCol || snapped.row !== run.targetCellRow;
        run.targetWorld = snapped.world;
        run.targetCellCol = snapped.col;
        run.targetCellRow = snapped.row;
        if (forceReset || cellChanged) run.hpaNav.markTargetChanged();
    };
    /** @param {number} dtMs */
    const tickProp = (prop, run, dtMs) => {
        if (!run.targetWorld) return;
        const grid = state.obstacleGrid;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        if (groundNavArrivedAtTarget(prop, run.targetWorld, run.targetCellCol, run.targetCellRow, grid, config.stopRadius)) {
            releaseMoveTarget(prop, run);
            return;
        }
        const { vx, vy, steering, beltWasOnBelt } = driveGroundNav({
            prop,
            targetWorld: run.targetWorld,
            targetCellCol: run.targetCellCol,
            targetCellRow: run.targetCellRow,
            nav: run.hpaNav,
            beltWasOnBelt: run.wasOnBelt,
            beltHandoffCooldown: run.beltHandoffCooldown,
            state,
            dtMs: dtMs,
            pathSettings: buildHpaGroundNavPathSettings(state, prop, config.stopRadius),
        });
        run.wasOnBelt = beltWasOnBelt;
        if (!steering) {
            if (beltWasOnBelt) clearGroundRollDrive(prop);
            return;
        }
        if (vx === 0 && vy === 0) return;
        steerRollToward(prop, vx, vy, config, steering?.desiredSpeed);
    };
    return {
        id: HPA_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            const run = getRun(prop);
            run.dragging = true;
            applyMoveTarget(run, world, true);
            return true;
        },
        onPointerMove(prop, world) {
            const run = getRun(prop);
            if (!run.dragging || !run.targetWorld) return;
            applyMoveTarget(run, world);
        },
        onPointerUp(prop) {
            getRun(prop).dragging = false;
        },
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            run.dragging = false;
            applyMoveTarget(run, world, true);
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            applyMoveTarget(run, world);
        },
        hasMoveTarget(prop) {
            return getRun(prop).targetWorld != null;
        },
        getTargetCell(prop) {
            const run = getRun(prop);
            if (!run.targetWorld) return null;
            return { col: run.targetCellCol, row: run.targetCellRow };
        },
        needsNavRetry(prop) {
            const run = getRun(prop);
            if (!run.targetWorld) return true;
            if (run.hpaNav.isRoutePending()) return false;
            return !navHasPath(run.hpaNav.navState);
        },
        replanMoveTarget(prop, state) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            run.hpaNav.replan(prop, run.targetWorld.x, run.targetWorld.y, state, REPLAN_PRIORITY_TARGET);
        },
        getLocomotionStatus(prop) {
            const run = getRun(prop);
            const nav = run.hpaNav.navState;
            return { hasRoute: navHasPath(nav), replanPending: run.hpaNav.isRoutePending(), stuckFrames: nav.stuckFrames, pathLen: nav.pathLen };
        },
        clearMoveTarget(prop) {
            clearGroundRollDrive(prop);
            clearRunTarget(getRun(prop), state);
        },
        tick(prop, dtMs) {
            tickProp(prop, getRun(prop), dtMs);
        },
        tickWorld(dtMs) {
            propRuns.forEach((run, propId) => {
                if (!run.targetWorld) return;
                const prop = state.entityRegistry.getLive(propId);
                if (!prop) {
                    propRuns.delete(propId);
                    return;
                }
                tickProp(prop, run, dtMs);
            });
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            if (!run?.targetWorld) return null;
            const grid = state.obstacleGrid;
            if (FloorBelt.isEntityOnBelt(grid, prop.x, prop.y))
                return {
                    mode: "direct",
                    pathNodes: [
                        { x: prop.x, y: prop.y },
                        { x: run.targetWorld.x, y: run.targetWorld.y },
                    ],
                    targetX: run.targetWorld.x,
                    targetY: run.targetWorld.y,
                };
            const nav = run.hpaNav.navState;
            const progressIdx = nav.pathProgressIdx;
            const trace =
                nav.pathLen > 0 && nav.pathSlot >= 0
                    ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.nav.worker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid)
                    : { pathNodes: [] };
            const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.nav.worker, nav.pathSlot, nav.pathLen) : null;
            return { mode: "hpa", pathNodes: trace.pathNodes, targetX: run.targetWorld.x, targetY: run.targetWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
        },
        reset() {
            propRuns.forEach((run) => run.hpaNav.reset(state));
            propRuns.clear();
        },
    };
}
export function createDefaultSandboxBehaviors(state) {
    return [
        createDragLaunchBehavior(state),
        createDragLaunchWaitBehavior(state),
        createDragLaunchFacingBehavior(state),
        createSpawnerBehavior(state),
        createFlipperBehavior(state),
        createCueStrikeBehavior(state),
        createDirectGroundNavBehavior(state),
        createHpaGroundNavBehavior(state),
        createFlowGroundNavBehavior(state),
    ];
}
// --- MERGED FROM render sandbox tail ---
// --- MERGED FROM sandboxCameraTarget.js ---
/** @param {object} state @param {object} prop */
export function isSandboxCameraTarget(state, prop) {
    return getSandboxEntityMeta(state).isCameraTarget(prop.id);
}
/** @param {object} state @param {object} prop @param {boolean} enabled */
export function setSandboxCameraTarget(state, prop, enabled) {
    const meta = getSandboxEntityMeta(state);
    if (enabled) meta.setCameraTarget(prop.id, true);
    else meta.setCameraTarget(prop.id, false);
}
/** @param {object} state @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry */
export function findSandboxCameraTargetWorldProp(state, registry) {
    const targetId = getSandboxEntityMeta(state).findCameraTargetEntityId();
    if (targetId == null) return null;
    return registry.getLive(targetId);
}
/**
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {object} state
 * @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry
 * @param {number} dtMs
 */
export function tickSandboxCameraFollow(viewport, state, registry, dtMs) {
    const target = findSandboxCameraTargetWorldProp(state, registry);
    if (!target) return;
    const factor = 1 - Math.exp(-8 * (dtMs / 1000));
    viewport.follow(target.x, target.y, factor);
}
// --- MERGED FROM kineticConstraintOverlays.js ---
function constraintWireColor(strain) {
    if (strain < 0.05) return "rgba(100, 255, 140, 0.85)";
    if (strain < 0.2) return "rgba(255, 220, 80, 0.9)";
    return "rgba(255, 80, 80, 0.95)";
}
const overlayAnchorA = { x: 0, y: 0 };
const overlayAnchorB = { x: 0, y: 0 };
export function appendKineticConstraintOverlayCommands(out, state) {
    const constraints = listKineticConstraints(state.kinetic);
    for (let i = 0; i < constraints.length; i++) {
        const entry = constraints[i];
        if (entry.type !== "distance") continue;
        const bodyA = state.entityRegistry.getLive(entry.bodyAId);
        const bodyB = state.entityRegistry.getLive(entry.bodyBId);
        if (!bodyA || !bodyB) continue;
        const wa = worldAnchorFromBody(bodyA, entry.anchorA.x, entry.anchorA.y, overlayAnchorA);
        const wb = worldAnchorFromBody(bodyB, entry.anchorB.x, entry.anchorB.y, overlayAnchorB);
        const dist = distanceBetweenAnchors(bodyA, entry.anchorA, bodyB, entry.anchorB);
        const strain = entry.restLength > 0 ? Math.abs(dist - entry.restLength) / entry.restLength : 0;
        const color = constraintWireColor(strain);
        out.push(overlayCachedWireEndpoint(wa.x, wa.y, 4, color));
        out.push(overlayCachedWireEndpoint(wb.x, wb.y, 4, color));
        appendOverlayWireLink(out, wa.x, wa.y, wb.x, wb.y, color, { lineWidth: 2, dash: [5, 4], endpointRadius: 4 });
    }
}
// --- MERGED FROM sandboxOverlayCommands.js ---
const FLOOR_BELT_SELECTION_BOUNDS = createAabb();
const WALL_CELL_SELECTION_BOUNDS = createAabb();
const PROP_TILE_CELL_BOUNDS = createAabb();
const PROP_SELECTION_STROKE = "rgba(255, 252, 245, 0.32)";
const PROP_SELECTION_DASH = [4, 4];
const SELECTION_RING_PAD = 4;
function selectionRingRadius(prop) {
    const base = prop.radius ?? 8;
    return base + SELECTION_RING_PAD;
}
export function appendSelectionOverlayCommands(out, { selectedProps, showRings, selectedFloorIdx = null, selectedVoxelIdx = null, selectedRailEdge = null, grid = null }) {
    if (!showRings) return;
    for (let i = 0; i < selectedProps.length; i++) {
        const prop = selectedProps[i];
        out.push(overlayCachedSelectionRing(prop.x, prop.y, selectionRingRadius(prop), { stroke: PROP_SELECTION_STROKE, lineWidth: 1, dash: PROP_SELECTION_DASH }));
    }
    if (selectedFloorIdx != null && grid) {
        const x = grid.gridCenterXByIdx(selectedFloorIdx);
        const y = grid.gridCenterYByIdx(selectedFloorIdx);
        out.push(
            overlayGridCellHighlight(centeredAabbInto(FLOOR_BELT_SELECTION_BOUNDS, x, y, grid.cellSize, grid.cellSize), grid.cellSize, "floor", {
                fill: "rgba(120, 200, 255, 0.1)",
                stroke: "rgba(120, 200, 255, 0.75)",
                lineWidth: 1,
                dash: [4, 3],
            }),
        );
    }
    if (selectedVoxelIdx != null && grid) {
        const x = grid.gridCenterXByIdx(selectedVoxelIdx);
        const y = grid.gridCenterYByIdx(selectedVoxelIdx);
        out.push(
            overlayGridCellHighlight(centeredAabbInto(WALL_CELL_SELECTION_BOUNDS, x, y, grid.cellSize, grid.cellSize), grid.cellSize, "voxel", {
                fill: "rgba(255, 152, 0, 0.12)",
                stroke: "rgba(255, 152, 0, 0.85)",
                lineWidth: 1,
                dash: [4, 3],
            }),
        );
    }
    if (selectedRailEdge && grid) appendGridEdgeOverlayCommand(out, grid, selectedRailEdge, { stroke: "rgba(255, 152, 0, 0.9)", lineWidth: 3 });
}
export function appendMarqueeOverlayCommands(out, { marqueeRect }) {
    if (!marqueeRect) return;
    out.push(overlayAabb(marqueeRect, { fill: "rgba(255, 252, 245, 0.05)", stroke: "rgba(255, 252, 245, 0.32)", lineWidth: 1, dash: [4, 4] }));
}
// --- MERGED FROM gridStampDrawCache.js ---
const SHARED_HALF_EXTENTS = { x: 0, y: 0 };
const beltDrawByTurn = { straight: createConveyorDraw(), left: createConveyorDraw({ turnDirection: "left" }), right: createConveyorDraw({ turnDirection: "right" }) };
function beltDrawForKind(kind) {
    const turn = FloorBelt.getElbowTurn(kind);
    if (turn === "left") return beltDrawByTurn.left;
    if (turn === "right") return beltDrawByTurn.right;
    return beltDrawByTurn.straight;
}
const floorBeltStampProxyProto = {
    ageMs: 0,
    getCustomSpriteCacheKey() {
        return `k${this.beltKind}`;
    },
};
function createGridCellStampProxy(proto, x, y, cellHalf, init) {
    const proxy = Object.create(proto);
    proxy.x = x;
    proxy.y = y;
    proxy.radius = cellHalf;
    proxy.halfExtents = SHARED_HALF_EXTENTS;
    init(proxy);
    return proxy;
}
function createFloorBeltStampProxy(x, y, facing, cellHalf, kind) {
    return createGridCellStampProxy(floorBeltStampProxyProto, x, y, cellHalf, (proxy) => {
        proxy.facing = facing;
        proxy.beltKind = kind;
    });
}
export function clearGridStampDrawCaches(state) {
    if (!state.sandbox) return;
    state.sandbox._floorOccupancyStampDrawCache = null;
}
export function syncFloorOccupancyStampDrawCache(state, grid) {
    if (!state.sandbox) return null;
    const revision = floorOccupancyStampDrawCacheKey(grid);
    const cached = state.sandbox._floorOccupancyStampDrawCache;
    if (cached?.revision === revision) return cached;
    const cellHalf = grid.cellHalfSize;
    SHARED_HALF_EXTENTS.x = cellHalf;
    SHARED_HALF_EXTENTS.y = cellHalf;
    const belts = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const kind = grid.floorKind[idx];
        if (!(grid.floorKind[idx] !== 0)) continue;
        const { x, y } = grid.gridToWorldByIdx(idx);
        if (FloorBelt.isBelt(kind)) belts.push({ proxy: createFloorBeltStampProxy(x, y, FloorBelt.getFacingAngle(grid.floorFacing[idx]), cellHalf, kind), x, y });
    }
    const next = { revision, belts };
    state.sandbox._floorOccupancyStampDrawCache = next;
    return next;
}
function drawCachedFloorOccupancyBelts(ctx, viewport, gameTime, cached) {
    const animFrame = Math.floor(gameTime / 60) % 8;
    const belts = cached.belts;
    for (let i = 0; i < belts.length; i++) {
        const item = belts[i];
        if (!viewport.circleInBounds(item.x, item.y, item.proxy.radius, "props")) continue;
        item.proxy.ageMs = gameTime;
        drawCachedPropSprite(ctx, item.proxy, viewport, GRID_STAMP_RENDER_KEY.FloorBelt, beltDrawForKind(item.proxy.beltKind), animFrame);
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (!grid.floorKind.some((k) => k !== 0)) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.belts.length) return;
    drawCachedFloorOccupancyBelts(ctx, viewport, state.gameTime, cached);
}
