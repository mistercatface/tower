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
} from "../Spatial/spatial.js";
import { visitLiveWorldProps, addWorldPropToState, removeWorldPropFromState, findLiveWorldProp } from "../../GameState/EntityRegistry.js";
import { isKinematicallyActive, applyKineticConstraintsFromSnapshot, clearKineticConstraints, collectKineticConstraintsSnapshot } from "../Physics/physics.js";
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
    spawnPoolRack,
    tryExportPoolRackSpawnGroup,
    tryExportLinkedBallChainSpawnGroup,
    spawnLinkedBallChain,
    setChainHead,
} from "../Props/props.js";
import { convexFootprintHalfExtents, emptyAabb, growAabbFromCenterInto, isEmptyAabb } from "../Math/math.js";
import { serializeVisualOverride, stampPropVisualOverride, sampleAssetBaseTintHex, setPropVisualBrightness, setPropVisualTint } from "../Color/visualOverride.js";
import { unregisterPropFromCategoryIndexes } from "../../GameState/SandboxWorldState.js";
import { clearGridStampDrawCaches } from "../Render/render.js";
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
export function collectPlacedSandboxPropEntries(state) {
    const meta = getSandboxEntityMeta(state);
    const byGroup = new Map();
    const entries = [];
    visitLiveWorldProps(state.worldProps, (prop) => {
        const groupId = meta.getSpawnGroupId(prop.id);
        if (groupId) {
            const group = byGroup.get(groupId) ?? [];
            group.push(prop);
            byGroup.set(groupId, group);
            return;
        }
        entries.push(serializePlacedProp(prop));
    });
    for (const members of byGroup.values()) {
        const exported = tryExportSpawnGroup(members, meta);
        if (exported) {
            entries.push(exported);
            continue;
        }
        for (let i = 0; i < members.length; i++) entries.push(serializePlacedProp(members[i]));
    }
    return entries;
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
        mutate(state, sel, patch, { getLiveProp, notifyUi }) {
            let changed = false;
            for (const id of sel.ids) {
                const prop = getLiveProp(id);
                if (!prop) continue;
                const asset = propCatalog[prop.spawnTypeId];
                if (!asset) continue;
                if (patch.faction !== undefined && prop.faction !== patch.faction) {
                    prop.faction = patch.faction;
                    changed = true;
                }
                if (patch.visualTint !== undefined) {
                    setPropVisualTint(prop, patch.visualTint);
                    changed = true;
                }
                if (patch.visualBrightness !== undefined) {
                    setPropVisualBrightness(prop, patch.visualBrightness);
                    changed = true;
                }
                if (patch.ballRadius !== undefined && isBallFamilyAsset(asset)) {
                    setPropRadius(prop, patch.ballRadius);
                    changed = true;
                }
                if ((patch.boxWidth !== undefined || patch.boxHeight !== undefined) && blockPresetUsesResizableFootprint(asset)) {
                    const w = patch.boxWidth ?? prop.shape.halfExtents.x * 2;
                    const h = patch.boxHeight ?? prop.shape.halfExtents.y * 2;
                    state.kinetic.setBoxShapeHalfExtents(prop, w / 2, h / 2);
                    changed = true;
                }
                if ((patch.crossLength !== undefined || patch.crossThickness !== undefined) && asset.id === "cross_pinwheel") {
                    const len = patch.crossLength ?? prop.shape.length;
                    const thick = patch.crossThickness ?? prop.shape.thickness;
                    applyCrossPinwheelFootprint(prop, len, thick);
                    changed = true;
                }
            }
            if (changed) notifyUi();
            return changed;
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
    if (doc.schemaVersion >= 9 && doc.kineticConstraints?.length) applyKineticConstraintsFromSnapshot(state.kinetic, doc.kineticConstraints, propRefs);
    if (doc.schemaVersion >= 9 && doc.chainHeadProp != null) {
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
