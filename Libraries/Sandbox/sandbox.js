import { BeltPacked, FloorBelt, migrateMapGenBoundsForMode, syncMapGenBoundsFromPlay, cellIsStaticWall, railWallEdgeAt, getRailWallInfo, cellInRect, getVoxelWallInfo, applyFloorCellEdit, isCanonicalEdgeRepresentativeIdx, commitGridNavEdit, GRID_NAV_EPOCH, bumpGridNavEpoch, applyStampedGridWallsFromSnapshot, clearAllStampedGridWalls, listPlacedRailWalls, listPlacedVoxelWalls, clearFloorCellNavEdit, unionCellBounds, clearRailWallAt, clearVoxelWallAt, ensureObstacleGridAtWorld, hitTestRailWallEdgeAtWorld, stampRailWallAt, setVoxelWallHeightAt, stampVoxelWallAt, computeCircleAimLineSegment, estimateRollingTravelDistance, appendGridEdgeOverlayCommand, formatGridWallEdgeSideLabel } from "../Spatial/spatial.js";
import { visitLiveWorldProps, addWorldPropToState, removeWorldPropFromState, findLiveWorldProp, addWorldPropsToState, findWorldPropAtInView, queryEntitiesInAabbStrict } from "../../GameState/EntityRegistry.js";
import { isKinematicallyActive, applyKineticConstraintsFromSnapshot, clearKineticConstraints, collectKineticConstraintsSnapshot, getKineticRollConfig, clearGroundRollDrive, decelerateRoll, steerRollToward, snapMoveTargetToCellCenter, addDistanceConstraint, listKineticConstraints, removeKineticConstraint, getConnectedBodyIds, wakeKineticBody, distanceBetweenAnchors, worldAnchorFromBody, kineticDynamicSlab, KINETIC_PAIR_TIER, IDENTITY_ROLL_QUAT, massFromBody, resolveBodyRadius, PolygonShape, physicsSettings, entityContainedInAabb } from "../Physics/physics.js";
import { appendActionRow, appendEditorHint, appendSelectField, appendColorField, appendNumberField, appendInstanceList, appendCheckboxField, appendEditorSubhead, appendTranslateFields } from "../UI/paramFields.js";
import { setFormFieldName } from "../UI/Component.js";
import { SliderControl } from "../UI/controls/SliderControl.js";
import { shippedSurfaceProfileIds } from "../../Config/procedural/profiles.js";
import { acquireWorldProp, applyPropBoxFootprint, setCirclePropRadius, getCirclePropRadius, setPolygonPropBoundingRadius, getPolygonPropBoundingRadius, propFootprintHalfExtents, applyCrossPinwheelFootprint, formatPropTypeLabel, formatSandboxSpawnLabel } from "../Props/props.js";
import { convexFootprintHalfExtents, emptyAabb, growAabbFromCenterInto, isEmptyAabb, normalizeXY, createAabb, centeredAabbInto, quantizeAngleIndex, aabbFromTwoPointsInto } from "../Math/math.js";
import { sampleFlowDirectionInto, buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay, HpaNavSession, snapNavGoalWorldInto, navHasPath, REPLAN_PRIORITY_TARGET, REPLAN_TARGET_MOVE_PX, obstacleReplanAllowed, replanPriorityFor, agentPose } from "../Navigation/navigation.js";
import { appendOverlayWireLink, overlayAimSegment, overlayCircleFillStroke, overlayCircleStroke, overlaySegment, overlayCachedSelectionRing, overlayGridCellHighlight, overlayAabb, overlayCachedCircleFillStroke, queryPropsInView, FloorBeltDrawCache, appendPathOverlayCommands } from "../Render/render.js";
import { serializeVisualOverride, stampPropVisualOverride, sampleAssetBaseTintHex, setPropVisualBrightness, setPropVisualTint, clearPropVisualOverride, getPropVisualBrightness, resolvePickerHex } from "../Color/visualOverride.js";
import { bindCanvasPointers, bindCanvasContextMenu, releasePointerCapture } from "../Input/canvasPointer.js";
import { createCanvasToolStack } from "../Editor/canvasToolStack.js";
import { createMarqueeSelectTool } from "../Editor/marqueeSelectTool.js";
import { createContextMenu } from "../UI/contextMenu.js";
import { markLabViewDirty } from "../../Apps/Editor/ui/preview.js";
import propCatalog from "../../Assets/props/index.js";
export class SandboxEntityMetaStore {
    constructor() {
        this.byEntityId = new Map();
        this.cameraTargetId = null;
    }
    get(entityId) {
        return this.byEntityId.get(entityId) ?? null;
    }
    ensure(entityId) {
        let meta = this.byEntityId.get(entityId);
        if (!meta) {
            meta = {};
            this.byEntityId.set(entityId, meta);
        }
        return meta;
    }
    delete(entityId) {
        if (this.cameraTargetId === entityId) this.cameraTargetId = null;
        this.byEntityId.delete(entityId);
    }
    clear() {
        this.byEntityId.clear();
        this.cameraTargetId = null;
    }
    getActiveBehaviorId(entityId) {
        return this.get(entityId)?.activeBehaviorId;
    }
    setActiveBehaviorId(entityId, behaviorId) {
        this.ensure(entityId).activeBehaviorId = behaviorId;
    }
    getBehaviorOverrides(entityId) {
        return this.get(entityId)?.behaviorOverrides;
    }
    setBehaviorOverrides(entityId, overrides) {
        this.ensure(entityId).behaviorOverrides = overrides;
    }
    isCameraTarget(entityId) {
        return this.cameraTargetId === entityId;
    }
    setCameraTarget(entityId, enabled) {
        if (enabled) this.cameraTargetId = entityId;
        else if (this.cameraTargetId === entityId) this.cameraTargetId = null;
    }
    findCameraTargetEntityId() {
        return this.cameraTargetId;
    }
    setPathVisual(entityId, visual) {
        this.ensure(entityId).pathVisual = visual;
    }
    getPathVisual(entityId) {
        return this.get(entityId)?.pathVisual;
    }
    isChainHead(entityId) {
        return this.get(entityId)?.chainHead === true;
    }
    setChainHead(entityId, head = true) {
        if (head) this.ensure(entityId).chainHead = true;
        else if (this.get(entityId)) this.get(entityId).chainHead = false;
    }
}
export const SANDBOX_FACTION_OPTIONS = [
    { id: "alpha", label: "Alpha" },
    { id: "bravo", label: "Bravo" },
    { id: "charlie", label: "Charlie" },
    { id: "delta", label: "Delta" },
    { id: "echo", label: "Echo" },
];
export function formatSandboxFactionLabel(factionId) {
    return SANDBOX_FACTION_OPTIONS.find((opt) => opt.id === factionId)?.label ?? factionId;
}
export class SandboxWorldState {
    constructor() {
        this.entityMeta = new SandboxEntityMetaStore();
        this.controller = null;
        this.behaviorById = null;
        this.floorBeltDrawCache = null;
    }
}
export const DIRECT_GROUND_NAV_BEHAVIOR_ID = "rollToCursorDirect";
export const FLOW_GROUND_NAV_BEHAVIOR_ID = "rollToCursorFlow";
export const HPA_GROUND_NAV_BEHAVIOR_ID = "rollToCursorHpa";
export const GROUND_NAV_BEHAVIOR_IDS = new Set([DIRECT_GROUND_NAV_BEHAVIOR_ID, FLOW_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID]);
export const SANDBOX_BEHAVIOR_LABELS = { dragLaunch: "Drag launch", dragLaunchWait: "Drag launch (wait for rest)", dragLaunchFacing: "Drag launch (yaw to shot)", spawner: "Spawner", [DIRECT_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (direct)", [HPA_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (HPA)", [FLOW_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (flow)" };
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
export const DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH = 16;
export const DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT = 16;
export function isResizableBoxSpawnAsset(asset) {
    return Boolean(asset?.sandbox?.resizableBox);
}
export function isSingleWorldPropSpawnAsset(asset) {
    return Boolean(asset) && !isGridFloorBeltSpawnAsset(asset);
}
function syncSandboxBehaviorById(state, behaviors) {
    state.sandbox.behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
}
export function resolveSandboxBehaviors(asset, state, prop = null) {
    const byId = state.sandbox.behaviorById;
    if (!byId) throw new Error("resolveSandboxBehaviors requires state.sandbox.behaviorById — mount sandbox controller or call syncSandboxBehaviorById");
    const behaviorOverrides = prop ? state.sandbox.entityMeta.getBehaviorOverrides(prop.id) : null;
    if (behaviorOverrides) {
        const stamped = [];
        for (const key of Object.keys(behaviorOverrides)) {
            if (key === "inputGates") continue;
            if (byId.has(key)) stamped.push(key);
        }
        if (stamped.length) return stamped;
    }
    if (Array.isArray(asset?.sandbox?.behaviors)) return asset.sandbox.behaviors.filter((id) => byId.has(id));
    throw new Error(`resolveSandboxBehaviors: asset ${asset?.id ?? "unknown"} missing sandbox.behaviors`);
}
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
/** @param {object} entity @param {InputGateUntil} until */
function entityPassesUntil(entity, until) {
    if (until === "atRest" || until === "allAtRest") return !entity || entity.isDead || !isKinematicallyActive(entity);
    return !entity || entity.isDead || Boolean(entity.isSleeping);
}
/** @param {object} entity @param {string[] | undefined} excludeStates */
function isExcludedFromGate(entity, excludeStates) {
    if (!excludeStates?.length) return false;
    const state = entity.currentStateName;
    return state != null && excludeStates.includes(state);
}
export function resolveInputGateScope(scope, prop, state, linkField) {
    if (scope === "self") return [prop];
    const linkValue = linkField ? prop[linkField] : undefined;
    if (linkValue == null) return [];
    const members = [];
    visitLiveWorldProps(state.worldProps, (entity) => {
        if (entity[linkField] !== linkValue) return;
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
    const stamped = state.sandbox.entityMeta.getBehaviorOverrides(prop.id)?.inputGates?.[behaviorId];
    const rules = Array.isArray(stamped) ? stamped : [];
    if (rules.length === 0) return { allowed: true };
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (!evaluateInputGateRule(rule, prop, state)) return { allowed: false, failedRule: rule };
    }
    return { allowed: true };
}
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
function mapGenIdxCol(idx, cols) {
    return idx % cols;
}
function mapGenIdxRow(idx, cols) {
    return (idx / cols) | 0;
}
function mapGenIdxWithCol(idx, grid, col) {
    const row = (idx / grid.cols) | 0;
    return grid.worldToIdx(grid.gridCenterX(Math.round(col)), grid.gridCenterY(row));
}
function mapGenIdxWithRow(idx, grid, row) {
    const col = idx % grid.cols;
    return grid.worldToIdx(grid.gridCenterX(col), grid.gridCenterY(Math.round(row)));
}
function appendMapGenIdxColRowFields(parent, grid, config, idxKey, colLabel, rowLabel, addBound) {
    addBound(
        parent,
        colLabel,
        () => mapGenIdxCol(config[idxKey], grid.cols),
        (v) => {
            config[idxKey] = mapGenIdxWithCol(config[idxKey], grid, v);
        },
    );
    addBound(
        parent,
        rowLabel,
        () => mapGenIdxRow(config[idxKey], grid.cols),
        (v) => {
            config[idxKey] = mapGenIdxWithRow(config[idxKey], grid, v);
        },
    );
}
function appendMapGenBoundsControls(panel, config, state, overlayHint, onPreviewChange) {
    const { playConfig } = state.editor;
    const grid = state.obstacleGrid;
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
            migrateMapGenBoundsForMode(grid, config);
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
                    syncMapGenBoundsFromPlay(grid, state.viewport, playConfig, config);
                    migrateMapGenBoundsForMode(grid, config);
                    refreshMapGenPanelInputs();
                    onPreviewChange();
                },
            },
        ],
        { className: "editor-tools-row" },
    );
    const setBound = (setter) => (v) => {
        setter(v);
        migrateMapGenBoundsForMode(grid, config);
    };
    const addBound = (parent, label, get, set, opts) => appendSyncedNumberField(parent, label, get, setBound(set), onPreviewChange, opts);
    appendMapGenIdxColRowFields(rectFields, grid, config, "boundsIdx", "Bounds col", "Bounds row", addBound);
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
    appendMapGenIdxColRowFields(circleFields, grid, config, "centerIdx", "Center col", "Center row", addBound);
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
    appendMapGenBoundsControls(panel, eraseConfig, state, "Red overlay on map overview — drag inside to move, drag edges/rings to resize. Clears voxel walls and rail edges in bounds.", onPreviewChange);
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
    const entry = { type: prop.type, x: prop.x, y: prop.y, facing: prop.facing, faction: prop.faction };
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
export function spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, faction, facing = 0, boxHalfExtents = undefined, visualOverride = undefined) {
    const asset = propCatalog[propTypeId];
    if (!asset) throw new Error(`Unknown prop type: ${propTypeId}`);
    if (isGridFloorBeltSpawnAsset(asset)) throw new Error(`Grid floor belt "${propTypeId}" is stamped on the grid, not spawned as a world prop`);
    const prop = acquireWorldProp(worldX, worldY, propTypeId, facing);
    if (boxHalfExtents) applyPropBoxFootprint(prop, boxHalfExtents.x, boxHalfExtents.y);
    prop.faction = faction;
    if (visualOverride != null) stampPropVisualOverride(prop, visualOverride);
    addWorldPropToState(state, prop);
    return prop;
}
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
/** @typedef {"off" | "normal" | "debug"} SandboxPathVisual */
export const SANDBOX_PATH_VISUAL_OFF = "off";
export const SANDBOX_PATH_VISUAL_NORMAL = "normal";
export const SANDBOX_PATH_VISUAL_DEBUG = "debug";
export const SANDBOX_PATH_VISUAL_OPTIONS = [SANDBOX_PATH_VISUAL_OFF, SANDBOX_PATH_VISUAL_NORMAL, SANDBOX_PATH_VISUAL_DEBUG];
export const SANDBOX_PATH_VISUAL_LABELS = { off: "Off", normal: "Normal", debug: "Debug" };
export const SANDBOX_PRIMARY_PROP_IDS = ["ball"];
function ballRadiusFromAsset(asset) {
    if (asset.physics?.radius == null) throw new Error(`asset ${asset.id} missing physics.radius`);
    return asset.physics.radius;
}
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
export function blockPresetUsesResizableFootprint(propId) {
    return isResizableBoxSpawnAsset(propCatalog[propId]);
}
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
    return { getSelection: () => selection, select, clearSelection, prunePropSelection, removePropFromSelection, togglePropInSelection, dropDeletedWallSelection };
}
/** @typedef {{ kind: 'prop', ids: Set<number> } | { kind: 'floor', idx: number } | { kind: 'voxel', idx: number } | { kind: 'rail', idx: number, side: number }} SandboxSelection */
/** @typedef {{ kind: 'prop', ids: number[] } | { kind: 'floor', idx: number } | { kind: 'voxel', idx: number } | { kind: 'rail', idx: number, side: number }} SandboxSelectInput */
export function selectionPropIds(sel) {
    return sel?.kind === "prop" ? [...sel.ids] : [];
}
export function selectionPrimaryPropId(sel, isLiveProp) {
    if (sel?.kind !== "prop") return null;
    for (const id of sel.ids) if (isLiveProp(id)) return id;
    return null;
}
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
const PLACEABLE = {
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
                const chain = spawnLinkedBallChain(state, idx, { headBallType: "snake", ballType: "ball", segmentCount: ctx.spawnSnakeLength, segmentRadius: ctx.spawnBallRadius, faction: ctx.spawnFaction, spacing: ctx.spawnBallRadius * 2, linkSlack: 1.0 });
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
            if (spawned && isBallFamilyAsset(placedAsset)) setCirclePropRadius(spawned, ctx.spawnBallRadius);
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
            if (!FloorBelt.canStampAt(state, idx)) return false;
            const packed = BeltPacked.defaultForSpawn(asset.id);
            if (!applyFloorCellEdit(state, idx, packed)) return false;
            ctx.placement.touchFloorPlacement(idx);
            ctx.pickSelection({ kind: "floor", idx });
            return true;
        },
        buildFromSelection(state, sel) {
            if (sel?.kind !== "floor") return null;
            const grid = state.obstacleGrid;
            const idx = sel.idx;
            if (!cellInRect(idx, grid)) return null;
            if (grid.floorPacked[idx] === 0) return null;
            const packed = grid.floorPacked[idx];
            return { idx, packed };
        },
        listSceneItems({ placement, listPlacedFloorBelts }) {
            const items = [];
            for (const entry of listPlacedFloorBelts()) items.push(sceneItem(placement.placementSeq(placement.floorPlacementKey(entry.idx), 2e9 + entry.idx), entry.label, { kind: "floor", idx: entry.idx }, "floor"));
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
            if (sel?.kind !== "voxel") return null;
            const grid = state.obstacleGrid;
            const idx = sel.idx;
            const info = getVoxelWallInfo(grid, idx);
            if (info == null) return null;
            return { idx, heightLevel: grid.grid[idx] };
        },
        listSceneItems({ placement }) {
            const items = [];
            for (const entry of placement.listTrackedVoxelWalls()) items.push(sceneItem(placement.placementSeq(placement.voxelPlacementKey(entry.idx), 3e9 + entry.idx), entry.label, { kind: "voxel", idx: entry.idx }, "wall:voxel"));
            return items;
        },
    },
    rail: {
        buildFromSelection(state, sel) {
            if (sel?.kind !== "rail") return null;
            const grid = state.obstacleGrid;
            const idx = sel.idx;
            const side = sel.side;
            return railWallEdgeAt(grid, idx, side) ? getRailWallInfo(grid, idx, side) : null;
        },
        listSceneItems({ placement }) {
            const items = [];
            for (const entry of placement.listTrackedRailWalls()) items.push(sceneItem(placement.placementSeq(placement.edgePlacementKey("rail", entry.idx, entry.side), 4e9 + entry.idx + entry.side * 1e8), entry.label, { kind: "rail", idx: entry.idx, side: entry.side }, "wall:rail"));
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
function dispatchSpawnPlaceableAt(state, worldX, worldY, asset, ctx) {
    for (let i = 0; i < SPAWN_ROWS.length; i++) {
        const row = SPAWN_ROWS[i];
        if (!row.matchesSpawnAsset(asset)) continue;
        return row.spawnAt(state, worldX, worldY, asset, ctx);
    }
    return false;
}
export const PLACEABLE_INSPECTOR_KINDS = ["prop", "floorBelt", "voxel", "rail"];
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
    const meta = state.sandbox.entityMeta;
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
    return { schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION, cellSize: grid.cellSize, origin: { minX: grid.minX, minY: grid.minY }, cols: grid.cols, rows: grid.rows, voxels, railWalls, floorBelts: FloorBelt.listPlacedForSnapshot(grid), props, kineticConstraints: collectKineticConstraintsSnapshot(state.kinetic, propIdToIndex), chainHeadProp };
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
    for (let i = state.worldProps.length - 1; i >= 0; i--) {
        const prop = state.worldProps[i];
        removeWorldPropFromState(state, prop, state.spatialFrame, state.sandbox.entityMeta);
    }
    clearKineticConstraints(state.kinetic);
    state.obstacleGrid.clearAllFloorCells();
    clearAllStampedGridWalls(state, { notify: false });
    state.sandbox.entityMeta.clear();
    FloorBeltDrawCache.clear(state);
}
/** @param {object} state @param {{ type: string, x: number, y: number, facing?: number, faction?: string, width?: number, height?: number }} entry */
function spawnSnapshotProp(state, entry) {
    const asset = propCatalog[entry.type];
    if (!asset) throw new Error(`Unknown prop type: ${entry.type}`);
    if (isGridFloorBeltSpawnAsset(asset)) return null;
    const halfExtents = entry.width != null && entry.height != null ? { x: entry.width / 2, y: entry.height / 2 } : undefined;
    const prop = spawnPlacedSandboxProp(state, entry.x, entry.y, entry.type, entry.faction, entry.facing ?? 0, halfExtents, entry.visualOverride);
    if (entry.radius != null)
        if (prop.shape?.type === "Polygon") setPolygonPropBoundingRadius(prop, entry.radius);
        else setCirclePropRadius(prop, entry.radius);
    if (prop && entry.type === "cross_pinwheel") {
        if (entry.crossLength == null || entry.crossThickness == null) throw new Error("cross_pinwheel snapshot entry requires crossLength and crossThickness");
        applyCrossPinwheelFootprint(prop, entry.crossLength, entry.crossThickness);
    }
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
        if (headProp) setChainHead(state, state.sandbox.entityMeta, headProp.id);
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
            placed.push({ id: prop.id, type: prop.type, faction: prop.faction, label: `${typeLabel} #${index}` });
        });
        return placed;
    };
    const listPlacedFloorBelts = () => {
        const grid = state.obstacleGrid;
        const counts = new Map();
        const placed = [];
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++) {
            const packed = grid.floorPacked[idx];
            if (!packed) continue;
            const index = (counts.get(packed) ?? 0) + 1;
            counts.set(packed, index);
            placed.push({ idx, packed, label: `${BeltPacked.label(packed)} #${index}` });
        }
        return placed;
    };
    let spawnFaction = "alpha";
    let spawnBoxWidth = DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH;
    let spawnBoxHeight = DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT;
    let spawnCrossLength = 32;
    let spawnCrossThickness = 8;
    let spawnBallRadius = null;
    let spawnVisualOverrideTint = null;
    let spawnVisualOverrideBrightness = 1;
    let spawnSnakeLength = 5;
    const resolveSpawnVisualOverride = (asset) => {
        if (!isBallFamilyAsset(asset) && !isBlockFamilyAsset(asset)) return null;
        const tint = spawnVisualOverrideTint ?? sampleAssetBaseTintHex(asset);
        const visualOverride = { tint };
        if (spawnVisualOverrideBrightness !== 1) visualOverride.brightness = spawnVisualOverrideBrightness;
        return visualOverride;
    };
    const spawnCtx = (options = {}) => ({ spawnPropId: spawnPropIdFromPalette(), spawnFaction, resolveSpawnPropTypeId: spawnPropIdFromPalette, resolveSpawnVisualOverride, spawnBallRadius: spawnBallRadius ?? ballRadiusFromAsset(propCatalog[spawnPropIdFromPalette()]), spawnBoxHalfExtents: { x: spawnBoxWidth / 2, y: spawnBoxHeight / 2 }, spawnCrossLength, spawnCrossThickness, spawnSnakeLength, pickSelection, notifyUi, placement, selectSpawned: options.selectSpawned !== false });
    const spawnAt = (worldX, worldY, options = {}) => {
        const asset = propCatalog[spawnPropIdFromPalette()];
        if (!asset) return false;
        return dispatchSpawnPlaceableAt(state, worldX, worldY, asset, spawnCtx(options));
    };
    const removeProp = (prop) => {
        removeWorldPropFromState(state, prop, state.spatialFrame, state.sandbox.entityMeta);
    };
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
            const s = sel();
            if (s?.kind !== "floor") return false;
            const idx = s.idx;
            if (state.obstacleGrid.floorPacked[idx] === 0) {
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
            const s = sel();
            if (s?.kind !== "floor") return false;
            const grid = state.obstacleGrid;
            const idx = s.idx;
            if (idx === targetIdx) return true;
            if (grid.floorPacked[idx] === 0) {
                clearSelection();
                return false;
            }
            if (!FloorBelt.canStampAt(state, targetIdx)) return false;
            const packed = grid.floorPacked[idx];
            grid.clearFloorCell(idx);
            if (!grid.writeFloorCell(targetIdx, packed)) {
                grid.writeFloorCell(idx, packed);
                return false;
            }
            commitGridNavEdit(state, idx);
            commitGridNavEdit(state, targetIdx);
            pickSelection({ kind: "floor", idx: targetIdx });
            return true;
        },
        setSelectedFloorBeltPacked(packed) {
            const s = sel();
            if (s?.kind !== "floor") return false;
            const grid = state.obstacleGrid;
            const idx = s.idx;
            if (grid.floorPacked[idx] === 0) {
                clearSelection();
                return false;
            }
            if (grid.floorPacked[idx] === packed) return true;
            applyFloorCellEdit(state, idx, packed);
            notifyUi();
            return true;
        },
        deleteSelectedFloorCell() {
            const s = sel();
            if (s?.kind !== "floor") return false;
            const grid = state.obstacleGrid;
            const idx = s.idx;
            if (grid.floorPacked[idx] !== 0) {
                if (!clearFloorCellNavEdit(state, idx)) return false;
            } else if (!grid.clearFloorCell(idx)) return false;
            placement.forgetFloorPlacement(idx);
            clearSelection();
            return true;
        },
        listPlacedVoxelWalls: () => listPlacedVoxelWalls(state.obstacleGrid),
        listPlacedRailWalls: () => listPlacedRailWalls(state.obstacleGrid),
        stampWallAtWorld(worldX, worldY) {
            const targetIdx = ensureObstacleGridAtWorld(state.obstacleGrid, worldX, worldY);
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
            const s = sel();
            if (s?.kind !== "voxel") return false;
            const idx = s.idx;
            if (!setVoxelWallHeightAt(state, idx, heightLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallProps(heightLevel, thicknessLevel) {
            const s = sel();
            if (s?.kind !== "rail") return false;
            const idx = s.idx;
            if (!stampRailWallAt(state, idx, s.side, heightLevel, thicknessLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallSide(newSide) {
            const s = sel();
            if (s?.kind !== "rail") return false;
            const grid = state.obstacleGrid;
            const idx = s.idx;
            const info = getRailWallInfo(grid, idx, s.side);
            if (!info || info.side === newSide) return true;
            if (railWallEdgeAt(grid, idx, newSide)) return false;
            if (!clearRailWallAt(state, idx, s.side)) return false;
            if (!stampRailWallAt(state, idx, newSide, info.heightLevel, info.thicknessLevel)) return false;
            pickSelection({ kind: "rail", idx, side: newSide });
            return true;
        },
        deleteSelectedWall() {
            const s = sel();
            if (s?.kind === "voxel") {
                const idx = s.idx;
                if (!clearVoxelWallAt(state, idx)) return false;
                placement.forgetVoxelPlacement(idx);
                clearSelection();
                return true;
            }
            if (s?.kind === "rail") {
                const grid = state.obstacleGrid;
                const idx = s.idx;
                if (!clearRailWallAt(state, idx, s.side)) return false;
                placement.forgetEdgePlacement("rail", idx, s.side);
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
        getSelectedProp() {
            pruneSelection();
            const id = selectionPrimaryPropId(sel(), (id) => registry().getLive(id));
            return id == null ? null : registry().getLive(id);
        },
        setSelectedChainHead(enabled) {
            const prop = this.getSelectedProp();
            if (!prop || !isChainLinkBall(prop)) return;
            if (enabled) setChainHead(state, state.sandbox.entityMeta, prop.id);
            else state.sandbox.entityMeta.setChainHead(prop.id, false);
            notifyUi();
        },
        isSelectedChainHead() {
            const prop = this.getSelectedProp();
            return prop ? state.sandbox.entityMeta.isChainHead(prop.id) : false;
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
        getSpawnPropId: spawnPropIdFromPalette,
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
        getSpawnBallRadius: (asset) => spawnBallRadius ?? ballRadiusFromAsset(asset),
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
        select: pickSelection,
        getSelectionInspector() {
            pruneSelection();
            const s = sel();
            if (!s) return null;
            return FROM_SELECTION[s.kind](state, s, { getLiveProp: (id) => registry().getLive(id) });
        },
        isWallPlaceMode: () => placePaletteKey.startsWith("wall:"),
        isMapGenPlaceMode: () => placePaletteKey.startsWith("mapGen:"),
        listPlacedSceneItems() {
            const ctx = { placement, listPlacedProps, listPlacedFloorBelts };
            const items = [];
            for (let i = 0; i < SCENE_LISTERS.length; i++) items.push(...SCENE_LISTERS[i](ctx));
            items.sort((a, b) => a.seq - b.seq);
            return items;
        },
        isSceneItemSelected(item) {
            return selectionMatchesSelect(sel(), item.select);
        },
        selectSceneItem(item) {
            if (item.paletteKey != null) setPlacePaletteKey(item.paletteKey);
            pickSelection(item.select);
        },
        deleteSceneItem(item) {
            DELETE_BY_SELECT_KIND[item.select.kind](this, item, pickSelection);
        },
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) {
                const prop = state.worldProps[i];
                removeWorldPropFromState(state, prop, state.spatialFrame, state.sandbox.entityMeta);
            }
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
export const DRAG_LAUNCH_FACING_BEHAVIOR_ID = "dragLaunchFacing";
export const SPAWNER_BEHAVIOR_ID = "spawner";
/** @param {object} prop @param {import("../dragLaunch.js").DragLaunchAim | null} aim */
function aimSpawnerFacing(prop, aim) {
    if (aim?.shotNx == null || aim.shotNy == null) return;
    prop.facing = Math.atan2(aim.shotNy, aim.shotNx);
    prop.angularVelocity = 0;
}
/** @param {object | null | undefined} asset */
export function isSpawnerProp(asset) {
    return asset?.sandbox?.spawner != null && typeof asset.sandbox.spawner === "object";
}
/** @param {object | null | undefined} prop @param {object | null | undefined} asset */
export function resolveSpawnerPropId(prop, asset) {
    return prop?.sandboxSpawnerPropId ?? asset.sandbox.spawner.defaultPropId;
}
/** @param {object | null | undefined} prop @param {object | null | undefined} asset */
export function getSpawnerDragConfig(_prop, asset) {
    return asset.sandbox.spawner.dragLaunch;
}
/** @param {object} prop @param {object | null | undefined} asset */
export function getSpawnerOutletWorld(prop, asset) {
    const facing = prop.facing ?? 0;
    const reach = resolveBodyRadius(prop);
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
    const spawned = acquireWorldProp(outlet.x, outlet.y, spawnId, Math.atan2(launchNy, launchNx));
    spawned.faction = spawnerWorldProp.faction;
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
function resolveSegmentPropId(index, { leaderIndex = 0, headPropId, bodyPropId, leaderPropId, resolvePropId }) {
    if (resolvePropId) return resolvePropId(index);
    const leaderId = leaderPropId ?? headPropId ?? bodyPropId;
    if (index === leaderIndex) return leaderId;
    return bodyPropId ?? headPropId ?? leaderId;
}
function applySegmentRadius(prop, segmentRadius, headScaleFn) {
    if (headScaleFn) headScaleFn(prop, segmentRadius);
    else if (segmentRadius != null) setCirclePropRadius(prop, segmentRadius);
}
export function spawnAgentChain(state, anchorIdx, spec) {
    const { headPropId, bodyPropId, leaderPropId, leaderIndex = 0, segmentCount = 2, faction, exportType = null, linkSlack = 1.0, segmentRadius = null, growDirX = -1, growDirY = 0, spacing = null, headScaleFn = null, onSegmentSpawned = null, spawnGroupId = null, resolvePropId = null } = spec;
    const grid = state.obstacleGrid;
    const meta = state.sandbox.entityMeta;
    const anchorX = grid.gridCenterXByIdx(anchorIdx);
    const anchorY = grid.gridCenterYByIdx(anchorIdx);
    const props = [];
    const propSpec = { leaderIndex, headPropId, bodyPropId, leaderPropId, resolvePropId };
    const firstProp = spawnPlacedSandboxProp(state, anchorX, anchorY, resolveSegmentPropId(0, propSpec), faction);
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
        props[i].spawnGroupId = resolvedGroupId;
        if (exportType) props[i].spawnGroupExportType = exportType;
    }
    props[leaderIndex].spawnGroupAnchor = true;
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
function segmentOffset(index, spacing, growDirX, growDirY) {
    return { x: index * spacing * growDirX, y: index * spacing * growDirY };
}
export function spawnLinkedBallChain(state, anchorIdx, options) {
    return spawnAgentChain(state, anchorIdx, { leaderIndex: 0, headPropId: options.headBallType ?? options.ballType, bodyPropId: options.ballType, segmentCount: options.segmentCount, faction: options.faction, exportType: options.exportType, linkSlack: options.linkSlack, segmentRadius: options.segmentRadius, growDirX: options.growDirX ?? -1, growDirY: options.growDirY ?? 0, spacing: options.spacing, spawnGroupId: options.spawnGroupId });
}
export function growChainSegment(state, tailProp, options) {
    const spacing = options.spacing;
    const ballType = options.ballType;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    const faction = options.faction ?? tailProp.faction;
    const exportType = options.exportType ?? null;
    const spawnGroupId = options.spawnGroupId ?? tailProp.spawnGroupId;
    const linkSlack = options.linkSlack ?? 1;
    const segmentRadius = options.segmentRadius ?? null;
    const offset = segmentOffset(1, spacing, growDirX, growDirY);
    const segment = spawnPlacedSandboxProp(state, tailProp.x + offset.x, tailProp.y + offset.y, ballType, faction);
    if (segmentRadius != null) setCirclePropRadius(segment, segmentRadius);
    if (spawnGroupId) {
        segment.spawnGroupId = spawnGroupId;
        if (exportType) segment.spawnGroupExportType = exportType;
    }
    addChainLink(state, tailProp.id, segment.id, linkSlack);
    return segment;
}
export function linkedChainOccupiedCellIndices(members, grid) {
    const indices = new Set();
    for (let i = 0; i < members.length; i++) {
        const idx = grid.worldToIdx(members[i].x, members[i].y);
        if (idx >= 0) indices.add(idx);
    }
    return indices;
}
export function tryExportLinkedBallChainSpawnGroup(members) {
    const exportType = members[0].spawnGroupExportType;
    if (!exportType) return null;
    const anchor = members.find((prop) => prop.spawnGroupAnchor) ?? members[0];
    return { type: exportType, x: anchor.x, y: anchor.y, facing: anchor.facing, faction: anchor.faction, segmentCount: members.length };
}
/** @typedef {{ minDrag: number, maxPull: number, pullScale: number, minPower: number, maxPower: number, powerCurve?: number }} DragLaunchConfig */
/** @typedef {{ active: boolean, anchorX: number, anchorY: number, startX: number, startY: number, pullX: number, pullY: number, shotNx: number | null, shotNy: number | null }} DragLaunchAim */
/** @param {object | null | undefined} asset */
export function getDragLaunchConfig(asset) {
    return asset.sandbox.dragLaunch;
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
    return { anchorX: aim.anchorX, anchorY: aim.anchorY, pullX: aim.anchorX + dx, pullY: aim.anchorY + dy, nx: physics.shotNx, ny: physics.shotNy, power: computeLaunchPower(physics.drag, config), drag: physics.drag };
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
function dragLaunchMaxRayDist(obstacleGrid) {
    if (obstacleGrid?.minX != null) return Math.hypot(obstacleGrid.maxX - obstacleGrid.minX, obstacleGrid.maxY - obstacleGrid.minY) * 1.25;
    return 2400;
}
/**
 * @param {object} prop
 * @param {object | null | undefined} state
 */
export function buildDragLaunchAimLineContext(prop, state) {
    if (!state || !prop) return null;
    const grid = state.obstacleGrid;
    const maxRayDist = dragLaunchMaxRayDist(grid);
    return { prop, radius: prop.radius, maxRayDist };
}
/**
 * @param {ReturnType<typeof getDragLaunchPreview>} preview
 * @param {ReturnType<typeof buildDragLaunchAimLineContext>} aimLineContext
 */
export function getDragLaunchAimLine(preview, aimLineContext) {
    if (!preview || preview.power <= 0 || !aimLineContext) return null;
    const travelDist = estimateRollingTravelDistance(preview.power, aimLineContext.prop?.strategy ?? {});
    return computeCircleAimLineSegment({ originX: preview.anchorX, originY: preview.anchorY, radius: aimLineContext.radius, nx: preview.nx, ny: preview.ny, maxTravelDist: travelDist, maxRayDist: aimLineContext.maxRayDist });
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
function buildDragLaunchBehavior(state, entry) {
    const spec = { id: entry.id, getConfig: entry.getConfig ? entry.getConfig(state) : dragLaunchConfigForProp, buildAimLineContext: entry.buildAimLineContext ? entry.buildAimLineContext(state) : dragLaunchAimLineContextForState(state) };
    if (entry.canStart) spec.canStart = entry.canStart(state);
    if (entry.onAim) spec.onAim = entry.onAim;
    if (entry.onLaunch) spec.onLaunch = entry.onLaunch(state);
    if (entry.resolveAimLine) spec.resolveAimLine = entry.resolveAimLine;
    const behavior = createDragLaunchInteraction(spec);
    if (entry.supports) return { ...behavior, supports: entry.supports };
    return behavior;
}
const DRAG_LAUNCH_BEHAVIORS = [
    { id: DRAG_LAUNCH_BEHAVIOR_ID },
    {
        id: DRAG_LAUNCH_WAIT_BEHAVIOR_ID,
        canStart(state) {
            return (prop) => {
                if (prop && !prop.isDead && isKinematicallyActive(prop)) return false;
                return evaluateInputGates(DRAG_LAUNCH_WAIT_BEHAVIOR_ID, prop, propCatalog[prop?.type], state).allowed;
            };
        },
    },
    {
        id: DRAG_LAUNCH_FACING_BEHAVIOR_ID,
        onLaunch(_state) {
            return (prop, shot) => {
                prop.facing = Math.atan2(shot.ny, shot.nx);
                prop.angularVelocity = 0;
                applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
            };
        },
    },
    {
        id: SPAWNER_BEHAVIOR_ID,
        getConfig(_state) {
            return (prop) => getSpawnerDragConfig(prop, propCatalog[prop.type]);
        },
        onAim: aimSpawnerFacing,
        onLaunch(state) {
            return (prop, shot) => fireSpawner(state, prop, { nx: shot.nx, ny: shot.ny, power: shot.power });
        },
        supports(_prop, asset) {
            return isSpawnerProp(asset);
        },
    },
];
export function createDragLaunchBehaviors(state) {
    return DRAG_LAUNCH_BEHAVIORS.map((entry) => buildDragLaunchBehavior(state, entry));
}
export function createDragLaunchBehavior(state) {
    return buildDragLaunchBehavior(state, DRAG_LAUNCH_BEHAVIORS[0]);
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
export function setChainHead(state, entityMeta, propId) {
    const members = getConnectedBodyIds(state.kinetic, propId);
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
    const meta = state.sandbox.entityMeta;
    return findLiveWorldProp(state.worldProps, (prop) => meta.isChainHead(prop.id));
}
export function sandboxReplanReason(navState, pendingTargetReplan, inFlight, targetX, targetY) {
    if (inFlight) return null;
    if (pendingTargetReplan) return "targetChange";
    if (!navState.pathLen) return "noPath";
    const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
    if (targetMovedPx >= REPLAN_TARGET_MOVE_PX) return "targetMoved";
    return null;
}
export function sandboxReplanAllowed(reason, isVisible, stuckFrames, stuckReplanFrames) {
    if (reason === "targetChange") return true;
    if (reason === "noPath") return isVisible || stuckFrames > stuckReplanFrames;
    if (reason === "targetMoved") return obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames);
    return false;
}
function applyGroundNavSandboxReplan(nav, prop, targetX, targetY, state, ctx) {
    let sandboxReason = sandboxReplanReason(nav.navState, nav.pendingTargetReplan, ctx.inFlight, targetX, targetY);
    if (sandboxReason === "targetMoved" && !nav.softReplanAllowed(ctx.stuckFrames, ctx.stuckReplanFrames)) sandboxReason = null;
    if (sandboxReason && sandboxReplanAllowed(sandboxReason, ctx.isVisible, ctx.stuckFrames, ctx.stuckReplanFrames)) return nav.requestReplan(prop, targetX, targetY, state, replanPriorityFor(sandboxReason, ctx.isVisible), sandboxReason);
    return null;
}
const SCRATCH_STEER_TARGET = { x: 0, y: 0 };
export function groundNavArrivedAtTarget(prop, targetWorld, targetCellIdx, grid, stopRadius) {
    const onBelt = FloorBelt.isEntityOnBelt(grid, prop.x, prop.y);
    const targetOnBelt = targetCellIdx != null && FloorBelt.isBeltAtIdx(grid, targetCellIdx);
    const dist = Math.hypot(targetWorld.x - prop.x, targetWorld.y - prop.y);
    return dist <= stopRadius && (!targetOnBelt || onBelt);
}
const HPA_PATH_SETTINGS_SCRATCH = {};
export function buildHpaGroundNavPathSettings(state, prop, stopRadius) {
    const hpaNav = physicsSettings.groundNavHpa;
    const settings = Object.assign(HPA_PATH_SETTINGS_SCRATCH, state.nav.settings);
    settings.pathWaypointArrival = Math.max(hpaNav.pathWaypointArrivalMin, resolveBodyRadius(prop) * hpaNav.pathWaypointArrivalRadiusFactor);
    settings.arrivalDistance = stopRadius;
    return settings;
}
export function driveGroundNav({ prop, targetWorld, nav, beltWasOnBelt, beltHandoffCooldown, state, dtMs, pathSettings }) {
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
    const { steering, replanReason } = nav.update(prop, steerTarget.x, steerTarget.y, state, dtMs, pathSettings, applyGroundNavSandboxReplan);
    return { vx: steering?.desiredX ?? 0, vy: steering?.desiredY ?? 0, steering, replanReason, beltWasOnBelt: false };
}
const FLOW_OVERLAY_DIR_SCRATCH = { x: 0, y: 0 };
const FLOW_DIR_SCRATCH = { x: 0, y: 0 };
function computeFlowFieldSteering(pose, targetX, targetY, flowFieldGrid) {
    const flowField = flowFieldGrid.getReadyFlowField(targetX, targetY);
    if (!flowField) return null;
    const dir = sampleFlowDirectionInto(FLOW_DIR_SCRATCH, pose.x, pose.y, flowField, flowFieldGrid.frame);
    if (!dir) return null;
    return { desiredX: dir.x, desiredY: dir.y };
}
function createGroundNavBehavior(state, config) {
    const { id, initRun, applyMoveTarget, tickSteering } = config;
    const propRuns = new Map();
    const activeRunIds = [];
    const markRunActive = (propId, run) => {
        if (!run.targetWorld) return;
        if (activeRunIds.indexOf(propId) === -1) activeRunIds.push(propId);
    };
    const markRunInactive = (propId) => {
        const index = activeRunIds.indexOf(propId);
        if (index >= 0) activeRunIds.splice(index, 1);
    };
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = initRun(state);
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRun = (prop, run) => {
        config.clearRunTarget(state, run);
        markRunInactive(prop.id);
    };
    const behavior = {
        id,
        onPointerDown(prop, world) {
            const run = getRun(prop);
            if ("dragging" in run) run.dragging = true;
            if ("moveTargetActive" in run) run.moveTargetActive = false;
            applyMoveTarget(state, run, world, prop, true);
            markRunActive(prop.id, run);
            return true;
        },
        onPointerMove(prop, world) {
            const run = getRun(prop);
            if ("dragging" in run && !run.dragging) return;
            if (!run.targetWorld) return;
            applyMoveTarget(state, run, world, prop, false);
        },
        onPointerUp(prop) {
            const run = getRun(prop);
            if ("dragging" in run) run.dragging = false;
            if ("moveTargetActive" in run && !run.moveTargetActive) {
                clearGroundRollDrive(prop);
                clearRun(prop, run);
            }
        },
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            if ("dragging" in run) run.dragging = false;
            if ("moveTargetActive" in run) run.moveTargetActive = true;
            applyMoveTarget(state, run, world, prop, true);
            markRunActive(prop.id, run);
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if ("moveTargetActive" in run && !run.moveTargetActive) return;
            if (!run.targetWorld) return;
            applyMoveTarget(state, run, world, prop, false);
        },
        tick(prop, dt) {
            tickSteering(state, prop, getRun(prop), dt);
        },
        tickWorld(dt) {
            for (let i = activeRunIds.length - 1; i >= 0; i--) {
                const propId = activeRunIds[i];
                const prop = state.entityRegistry.getLive(propId);
                if (!prop) {
                    propRuns.delete(propId);
                    activeRunIds.splice(i, 1);
                    continue;
                }
                const run = propRuns.get(propId);
                if (!run?.targetWorld) {
                    activeRunIds.splice(i, 1);
                    continue;
                }
                tickSteering(state, prop, run, dt);
                if (!run.targetWorld) activeRunIds.splice(i, 1);
            }
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            return config.getPathOverlay(state, prop, run);
        },
        reset() {
            config.onReset(state, propRuns);
            activeRunIds.length = 0;
        },
    };
    if (config.hasMoveTarget) behavior.hasMoveTarget = (prop) => config.hasMoveTarget(getRun(prop));
    if (config.clearMoveTarget) behavior.clearMoveTarget = (prop) => config.clearMoveTarget(state, prop, getRun, (run) => clearRun(prop, run));
    if (config.getTargetCellIdx) behavior.getTargetCellIdx = (prop) => config.getTargetCellIdx(state, getRun(prop));
    if (config.needsNavRetry) behavior.needsNavRetry = (prop) => config.needsNavRetry(getRun(prop));
    if (config.replanMoveTarget) behavior.replanMoveTarget = (prop) => config.replanMoveTarget(state, getRun(prop), prop);
    if (config.getLocomotionStatus) behavior.getLocomotionStatus = (prop) => config.getLocomotionStatus(getRun(prop));
    return behavior;
}
const DIRECT_GROUND_NAV_CONFIG = {
    id: DIRECT_GROUND_NAV_BEHAVIOR_ID,
    initRun() {
        return { targetWorld: null, dragging: false, moveTargetActive: false };
    },
    applyMoveTarget(state, run, world) {
        run.targetWorld = { x: world.x, y: world.y };
    },
    clearRunTarget(state, run) {
        run.targetWorld = null;
        run.dragging = false;
        run.moveTargetActive = false;
    },
    hasMoveTarget(run) {
        return run.moveTargetActive && run.targetWorld != null;
    },
    clearMoveTarget(state, prop, getRun, clearRun) {
        clearGroundRollDrive(prop);
        clearRun(getRun(prop));
    },
    tickSteering(state, prop, run) {
        if (!run.targetWorld || (!run.dragging && !run.moveTargetActive)) return;
        const config = getKineticRollConfig(prop);
        const dx = run.targetWorld.x - prop.x;
        const dy = run.targetWorld.y - prop.y;
        const dist = Math.hypot(dx, dy);
        if (dist < config.stopRadius) {
            if (run.moveTargetActive) {
                clearGroundRollDrive(prop);
                DIRECT_GROUND_NAV_CONFIG.clearRunTarget(state, run);
                return;
            }
            decelerateRoll(prop, config);
            return;
        }
        steerRollToward(prop, dx / dist, dy / dist, config);
    },
    getPathOverlay(state, prop, run) {
        if (!run?.targetWorld || (!run.dragging && !run.moveTargetActive)) return null;
        return {
            mode: "direct",
            pathNodes: [
                { x: prop.x, y: prop.y },
                { x: run.targetWorld.x, y: run.targetWorld.y },
            ],
        };
    },
    onReset(state, propRuns) {
        propRuns.clear();
    },
};
const FLOW_GROUND_NAV_CONFIG = {
    id: FLOW_GROUND_NAV_BEHAVIOR_ID,
    initRun() {
        return { targetWorld: null, dragging: false, lastTopologyKey: "" };
    },
    applyMoveTarget(state, run, world, prop) {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        run.targetWorld = { x: snapped.worldX, y: snapped.worldY };
        const steerTarget = snapNavGoalWorldInto(SCRATCH_STEER_TARGET, state.obstacleGrid, prop.x, prop.y, run.targetWorld.x, run.targetWorld.y);
        state.flowFieldGrid.ensureRollTargetWindow(prop.x, prop.y, steerTarget.x, steerTarget.y, state.nav.settings.recenterThreshold);
    },
    clearRunTarget(state, run) {
        run.targetWorld = null;
        run.dragging = false;
        run.lastTopologyKey = "";
    },
    tickSteering(state, prop, run) {
        if (!run.targetWorld) return;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        const steerTarget = snapNavGoalWorldInto(SCRATCH_STEER_TARGET, state.obstacleGrid, prop.x, prop.y, run.targetWorld.x, run.targetWorld.y);
        const flowFieldGrid = state.flowFieldGrid;
        const topologyKey = state.nav.topologyKey();
        if (topologyKey !== run.lastTopologyKey) {
            run.lastTopologyKey = topologyKey;
            flowFieldGrid.refresh();
        }
        flowFieldGrid.ensureRollTargetWindow(prop.x, prop.y, steerTarget.x, steerTarget.y, state.nav.settings.recenterThreshold);
        const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
        if (distToTarget <= config.stopRadius) {
            clearGroundRollDrive(prop);
            FLOW_GROUND_NAV_CONFIG.clearRunTarget(state, run);
            return;
        }
        const steering = computeFlowFieldSteering(agentPose(prop), steerTarget.x, steerTarget.y, flowFieldGrid);
        if (!steering) return;
        steerRollToward(prop, steering.desiredX, steering.desiredY, config);
    },
    getPathOverlay(state, prop, run) {
        if (!run?.targetWorld) return null;
        const steerTarget = snapNavGoalWorldInto(SCRATCH_STEER_TARGET, state.obstacleGrid, prop.x, prop.y, run.targetWorld.x, run.targetWorld.y);
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
        return { mode: "flow", propX: prop.x, propY: prop.y, propRadius: resolveBodyRadius(prop), dirX, dirY, targetX: steerTarget.x, targetY: steerTarget.y };
    },
    onReset(state, propRuns) {
        propRuns.clear();
    },
};
const HPA_GROUND_NAV_CONFIG = {
    id: HPA_GROUND_NAV_BEHAVIOR_ID,
    initRun() {
        return { targetWorld: null, targetCellIdx: null, dragging: false, wasOnBelt: false, beltHandoffCooldown: { frames: 0 }, hpaNav: new HpaNavSession() };
    },
    applyMoveTarget(state, run, world, prop, forceReset) {
        const grid = state.obstacleGrid;
        const snapped = snapMoveTargetToCellCenter(grid, world);
        const nextIdx = snapped.idx;
        const cellChanged = nextIdx !== run.targetCellIdx;
        run.targetWorld = { x: snapped.worldX, y: snapped.worldY };
        run.targetCellIdx = nextIdx;
        if (forceReset || cellChanged) run.hpaNav.markTargetChanged();
    },
    clearRunTarget(state, run) {
        run.targetWorld = null;
        run.targetCellIdx = null;
        run.dragging = false;
        run.wasOnBelt = false;
        run.beltHandoffCooldown.frames = 0;
        run.hpaNav.reset(state);
    },
    hasMoveTarget(run) {
        return run.targetWorld != null;
    },
    clearMoveTarget(state, prop, getRun, clearRun) {
        clearGroundRollDrive(prop);
        clearRun(getRun(prop));
    },
    tickSteering(state, prop, run, dtMs) {
        if (!run.targetWorld) return;
        const grid = state.obstacleGrid;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        if (groundNavArrivedAtTarget(prop, run.targetWorld, run.targetCellIdx, grid, config.stopRadius)) {
            clearGroundRollDrive(prop);
            HPA_GROUND_NAV_CONFIG.clearRunTarget(state, run);
            return;
        }
        const { vx, vy, steering, beltWasOnBelt } = driveGroundNav({ prop, targetWorld: run.targetWorld, nav: run.hpaNav, beltWasOnBelt: run.wasOnBelt, beltHandoffCooldown: run.beltHandoffCooldown, state, dtMs, pathSettings: buildHpaGroundNavPathSettings(state, prop, config.stopRadius) });
        run.wasOnBelt = beltWasOnBelt;
        if (!steering) {
            if (beltWasOnBelt) clearGroundRollDrive(prop);
            return;
        }
        if (vx === 0 && vy === 0) return;
        steerRollToward(prop, vx, vy, config, steering?.desiredSpeed);
    },
    getTargetCellIdx(state, run) {
        return run.targetCellIdx;
    },
    needsNavRetry(run) {
        if (!run.targetWorld) return true;
        if (run.hpaNav.isRoutePending()) return false;
        return !navHasPath(run.hpaNav.navState);
    },
    replanMoveTarget(state, run, prop) {
        if (!run.targetWorld) return;
        run.hpaNav.replan(prop, run.targetWorld.x, run.targetWorld.y, state, REPLAN_PRIORITY_TARGET);
    },
    getLocomotionStatus(run) {
        const nav = run.hpaNav.navState;
        return { hasRoute: navHasPath(nav), replanPending: run.hpaNav.isRoutePending(), stuckFrames: nav.stuckFrames, pathLen: nav.pathLen };
    },
    getPathOverlay(state, prop, run) {
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
        const trace = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.nav.worker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid) : { pathNodes: [] };
        const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.nav.worker, nav.pathSlot, nav.pathLen) : null;
        return { mode: "hpa", pathNodes: trace.pathNodes, targetX: run.targetWorld.x, targetY: run.targetWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
    },
    onReset(state, propRuns) {
        propRuns.forEach((run) => run.hpaNav.reset(state));
        propRuns.clear();
    },
};
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
export function createDefaultSandboxBehaviors(state) {
    return [...createDragLaunchBehaviors(state), createGroundNavBehavior(state, DIRECT_GROUND_NAV_CONFIG), createGroundNavBehavior(state, HPA_GROUND_NAV_CONFIG), createGroundNavBehavior(state, FLOW_GROUND_NAV_CONFIG)];
}
/** @param {object} state @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry */
export function findSandboxCameraTargetWorldProp(state, registry) {
    const targetId = state.sandbox.entityMeta.findCameraTargetEntityId();
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
export class FollowCamera {
    constructor(state, { triggerKey = "Tab" } = {}) {
        this.state = state;
        this.triggerKey = triggerKey;
        this.targetProp = null;
        this._candidateListFn = null;
        this._pickResolverFn = null;
        this._onTargetChangedCallbacks = new Set();
        this._handleKeyDown = this._handleKeyDown.bind(this);
    }
    registerCandidateList(fn) {
        this._candidateListFn = fn;
    }
    registerPickResolver(fn) {
        this._pickResolverFn = fn;
    }
    addOnTargetChanged(cb) {
        this._onTargetChangedCallbacks.add(cb);
    }
    removeOnTargetChanged(cb) {
        this._onTargetChangedCallbacks.delete(cb);
    }
    focus(prop, snap = true) {
        const oldTarget = this.targetProp;
        if (oldTarget === prop) {
            if (prop && snap) this.state.viewport?.snapTo?.(prop.x, prop.y);
            return;
        }
        if (oldTarget) this.state.sandbox.entityMeta.setCameraTarget(oldTarget.id, false);
        this.targetProp = prop;
        if (prop) {
            this.state.sandbox.entityMeta.setCameraTarget(prop.id, true);
            if (snap) this.state.viewport?.snapTo?.(prop.x, prop.y);
        }
        for (const cb of this._onTargetChangedCallbacks) cb(prop);
    }
    clear() {
        this.focus(null);
    }
    cycle(getProps) {
        const fn = getProps || this._candidateListFn;
        const props = fn ? fn() : [];
        const validProps = props.filter((p) => p && !p.isDead);
        if (validProps.length === 0) {
            this.clear();
            return null;
        }
        const currentIndex = this.targetProp ? validProps.findIndex((p) => p.id === this.targetProp.id) : -1;
        const nextIndex = (currentIndex + 1) % validProps.length;
        const nextProp = validProps[nextIndex];
        this.focus(nextProp, true);
        return nextProp;
    }
    focusFromPropId(propId) {
        if (!this._candidateListFn && !this._pickResolverFn) return false;
        let prop = this.state.entityRegistry.getLive(propId);
        if (!prop) return false;
        if (this._pickResolverFn) {
            const resolved = this._pickResolverFn(propId);
            if (resolved) {
                if (this.targetProp && this.targetProp.id === resolved.id) return false;
                this.focus(resolved, true);
                return true;
            }
        }
        if (this._candidateListFn) {
            const candidates = this._candidateListFn();
            const isCandidate = candidates.some((c) => c && c.id === prop.id);
            if (isCandidate) {
                if (this.targetProp && this.targetProp.id === prop.id) return false;
                this.focus(prop, true);
                return true;
            }
        }
        return false;
    }
    _handleKeyDown(e) {
        if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
        if (e.code === this.triggerKey) {
            e.preventDefault();
            this.cycle();
        }
    }
    bindInput() {
        window.addEventListener("keydown", this._handleKeyDown);
    }
    unbindInput() {
        window.removeEventListener("keydown", this._handleKeyDown);
    }
    destroy() {
        this.unbindInput();
        this.reset();
    }
    reset() {
        this.clear();
        this._candidateListFn = null;
        this._pickResolverFn = null;
    }
}
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
        out.push(overlayCachedCircleFillStroke(wa.x, wa.y, 4, { fill: color, stroke: color, lineWidth: 1 }, OVERLAY_RENDER_KEY.WireEndpoint, wireEndpointCacheKey(4, color), 1));
        out.push(overlayCachedCircleFillStroke(wb.x, wb.y, 4, { fill: color, stroke: color, lineWidth: 1 }, OVERLAY_RENDER_KEY.WireEndpoint, wireEndpointCacheKey(4, color), 1));
        appendOverlayWireLink(out, wa.x, wa.y, wb.x, wb.y, color, { lineWidth: 2, dash: [5, 4], endpointRadius: 4 });
    }
}
const FLOOR_BELT_SELECTION_BOUNDS = createAabb();
const WALL_CELL_SELECTION_BOUNDS = createAabb();
const PROP_TILE_CELL_BOUNDS = createAabb();
const PROP_SELECTION_STROKE = "rgba(255, 252, 245, 0.32)";
const PROP_SELECTION_DASH = [4, 4];
const SELECTION_RING_PAD = 4;
function selectionRingRadius(prop) {
    const base = resolveBodyRadius(prop);
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
        out.push(overlayGridCellHighlight(centeredAabbInto(FLOOR_BELT_SELECTION_BOUNDS, x, y, grid.cellSize, grid.cellSize), grid, "floor", { fill: "rgba(120, 200, 255, 0.1)", stroke: "rgba(120, 200, 255, 0.75)", lineWidth: 1, dash: [4, 3] }));
    }
    if (selectedVoxelIdx != null && grid) {
        const x = grid.gridCenterXByIdx(selectedVoxelIdx);
        const y = grid.gridCenterYByIdx(selectedVoxelIdx);
        out.push(overlayGridCellHighlight(centeredAabbInto(WALL_CELL_SELECTION_BOUNDS, x, y, grid.cellSize, grid.cellSize), grid, "voxel", { fill: "rgba(255, 152, 0, 0.12)", stroke: "rgba(255, 152, 0, 0.85)", lineWidth: 1, dash: [4, 3] }));
    }
    if (selectedRailEdge && grid) appendGridEdgeOverlayCommand(out, grid, selectedRailEdge, { stroke: "rgba(255, 152, 0, 0.9)", lineWidth: 3 });
}
export function appendMarqueeOverlayCommands(out, { marqueeRect }) {
    if (!marqueeRect) return;
    out.push(overlayAabb(marqueeRect, { fill: "rgba(255, 252, 245, 0.05)", stroke: "rgba(255, 252, 245, 0.32)", lineWidth: 1, dash: [4, 4] }));
}
export function createSandboxPointerGestures({ getCanvas, session, clientToWorld }) {
    let interactionBehavior = null;
    let groundNav = null;
    return {
        hasCapture: () => interactionBehavior != null || groundNav != null,
        reset() {
            interactionBehavior = null;
            groundNav = null;
        },
        startPropInteraction(behavior, e) {
            interactionBehavior = behavior;
            getCanvas().setPointerCapture(e.pointerId);
        },
        startGroundNav(move, world, e) {
            move.behavior.setMoveTarget(move.prop, world);
            groundNav = { prop: move.prop, behavior: move.behavior };
            getCanvas().setPointerCapture(e.pointerId);
        },
        capturesPointerMove: () => groundNav != null || interactionBehavior != null,
        onPointerMove(_world, e) {
            if (groundNav) {
                groundNav.behavior.updateMoveTarget(groundNav.prop, clientToWorld(e.clientX, e.clientY));
                return;
            }
            if (!interactionBehavior) return;
            const prop = session.getSelectedProp();
            if (!prop) return;
            interactionBehavior.onPointerMove(prop, clientToWorld(e.clientX, e.clientY), e);
            e.stopPropagation();
        },
        onPointerUp(_world, e) {
            if (groundNav) {
                const nav = groundNav;
                groundNav = null;
                releasePointerCapture(getCanvas(), e);
                nav.behavior.updateMoveTarget(nav.prop, clientToWorld(e.clientX, e.clientY));
                session.sync();
                return true;
            }
            if (!interactionBehavior) return false;
            const prop = session.getSelectedProp();
            if (prop) {
                const world = clientToWorld(e.clientX, e.clientY);
                interactionBehavior.onPointerMove(prop, world, e);
                interactionBehavior.onPointerUp(prop, e);
            }
            interactionBehavior = null;
            releasePointerCapture(getCanvas(), e);
            e.stopPropagation();
            session.sync();
            return true;
        },
    };
}
export function createSandboxDeletePointerTool(state, session) {
    return {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 2) return false;
            if (state.editor.lockSelection) return true;
            if (session.getSelection()?.kind === "prop") return true;
            const registry = state.entityRegistry;
            const hit = findWorldPropAtInView(registry, state.spatialFrame, world.x, world.y);
            if (hit) {
                session.deleteProp(hit);
                return true;
            }
            const grid = state.obstacleGrid;
            const idx = grid.worldToIdx(world.x, world.y);
            if (FloorBelt.clearOverlayAt(state, idx)) {
                const sel = session.getSelection();
                if (sel?.kind === "floor" && sel.idx === idx) session.clearSelection();
                session.sync();
                return true;
            }
            return false;
        },
    };
}
export function createSandboxGroundNavContextMenu(state, session, { behaviorById, entityMeta, onIssued }) {
    const menu = createContextMenu();
    const issueGroundNav = ({ propIds, behaviorId, world }) => {
        const moved = issueGroundNavToSelection(state, { propIds, behaviorId, world, behaviorById, entityMeta: entityMeta() });
        if (moved > 0) onIssued?.();
        return moved;
    };
    return {
        close: () => menu.close(),
        isOpen: () => menu.isOpen(),
        tryOpen(clientX, clientY, world) {
            const sel = session.getSelection();
            if (sel?.kind !== "prop") return false;
            const propIds = selectionPropIds(sel);
            if (propIds.length === 0) return false;
            const navCount = countNavPropsInSelection(state, propIds, entityMeta());
            const items = buildGroundNavSelectionMenuActions({ propIds, world, navCount, issueGroundNav });
            if (items.length === 0) return false;
            menu.open(clientX, clientY, items);
            return true;
        },
    };
}
export function createSandboxMarqueeTool(state, session, { getCanvas, aabbScratch, stampPropBehavior, selectPropIds }) {
    return createMarqueeSelectTool({
        getCanvas,
        canBegin: (e) => e.shiftKey,
        buildAabbFromDrag: (startWorld, endWorld) => aabbFromTwoPointsInto(aabbScratch, startWorld.x, startWorld.y, endWorld.x, endWorld.y),
        onClick(world, e) {
            if (!e.shiftKey && !session.isWallPlaceMode() && !session.isMapGenPlaceMode() && session.spawnAt(world.x, world.y)) stampPropBehavior(session.getSelectedProp());
            else session.clearSelection();
        },
        onBoxSelect(bounds) {
            const filter = session.getSelectionTagFilter();
            const props = queryEntitiesInAabbStrict(state.entityRegistry, bounds, { kinds: ["worldProp"], hitTest: "circle", match: (prop) => entityContainedInAabb(prop, bounds) && sandboxAssetMatchesTagFilter(propCatalog[prop.type], filter) });
            selectPropIds(props.map((prop) => prop.id));
        },
    });
}
export function createSandboxPrimaryPointerTools(state, session, { stampPropBehavior, blocksPlacement, resolveBehavior, resolveGroundMove, gestures, issueGroundNavToSelected }) {
    const behaviors = state.sandbox.behaviorById ? [...state.sandbox.behaviorById.values()] : [];
    let lastClickTime = 0;
    let lastClickX = 0;
    let lastClickY = 0;
    let lastClickClientX = 0;
    let lastClickClientY = 0;
    let lastSelectedBoidId = null;
    let lastSelectedBoidTime = 0;
    const tryPlaceSpawnAtWorld = (world, options = {}) => {
        if (session.isWallPlaceMode() || session.isMapGenPlaceMode() || blocksPlacement()) return false;
        if (!session.spawnAt(world.x, world.y, options)) return false;
        stampPropBehavior(session.getSelectedProp());
        return true;
    };
    const modifierTool = {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 0 || (!e.ctrlKey && !e.metaKey)) return false;
            const hit = findWorldPropAtInView(state.entityRegistry, state.spatialFrame, world.x, world.y);
            if (hit) return false;
            return tryPlaceSpawnAtWorld(world, { selectSpawned: false });
        },
    };
    const interactTool = {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 0) return false;
            const now = e.timeStamp || Date.now();
            const hasClient = e.clientX !== undefined && e.clientY !== undefined;
            const isDoubleTap = e.detail === 2 || (now - lastClickTime < 300 && (hasClient ? Math.hypot(e.clientX - lastClickClientX, e.clientY - lastClickClientY) < 20.0 : Math.hypot(world.x - lastClickX, world.y - lastClickY) < 8.0));
            let targetBoidId = lastSelectedBoidId;
            if (state.editor.lockSelection) {
                const boid = state.worldProps.find((p) => p.type === "boid_triangle");
                if (boid) targetBoidId = boid.id;
            }
            if (isDoubleTap && targetBoidId && (state.editor.lockSelection || now - lastSelectedBoidTime < 500)) {
                session.select({ kind: "prop", ids: [targetBoidId] });
                if (issueGroundNavToSelected("rollToCursorHpa", world)) {
                    lastClickTime = now;
                    lastClickX = world.x;
                    lastClickY = world.y;
                    lastClickClientX = e.clientX ?? 0;
                    lastClickClientY = e.clientY ?? 0;
                    return true;
                }
            }
            const selectedPropBeforeClick = session.getSelectedProp();
            if (selectedPropBeforeClick && selectedPropBeforeClick.type === "boid_triangle") {
                lastSelectedBoidId = selectedPropBeforeClick.id;
                lastSelectedBoidTime = now;
            } else {
                lastSelectedBoidId = null;
                lastSelectedBoidTime = 0;
            }
            lastClickTime = now;
            lastClickX = world.x;
            lastClickY = world.y;
            lastClickClientX = e.clientX ?? 0;
            lastClickClientY = e.clientY ?? 0;
            for (let i = 0; i < behaviors.length; i++) if (behaviors[i].tryCanvasInput?.(world, e)) return true;
            session.pruneSelection();
            const registry = state.entityRegistry;
            const hit = findWorldPropAtInView(registry, state.spatialFrame, world.x, world.y);
            if (hit) {
                if (state.editor.lockSelection && !session.isSelected(hit.id)) return "consume";
                if (state.followCamera?.focusFromPropId(hit.id)) return "consume";
                if (hit.type === "boid_triangle") {
                    const entityMeta = state.sandbox.entityMeta;
                    const prevId = entityMeta.getActiveBehaviorId(hit.id);
                    if (prevId && prevId !== "dragLaunch") {
                        const prevBehavior = behaviors.find((b) => b.id === prevId);
                        if (prevBehavior?.clearMoveTarget) prevBehavior.clearMoveTarget(hit);
                    }
                    entityMeta.setActiveBehaviorId(hit.id, "dragLaunch");
                }
                const allowed = resolveSandboxBehaviors(propCatalog[hit.type], state, hit);
                if (allowed.length > 0) {
                    if (e.ctrlKey || e.metaKey) {
                        session.togglePropInSelection(hit.id);
                        return "consume";
                    }
                    session.select({ kind: "prop", ids: [hit.id] });
                }
                const prop = session.getSelectedProp();
                const behavior = resolveBehavior();
                if (prop && behavior?.onPointerDown(prop, world, e)) {
                    gestures.startPropInteraction(behavior, e);
                    return true;
                }
                return "consume";
            }
            const groundMove = resolveGroundMove();
            if (groundMove) {
                gestures.startGroundNav(groundMove, world, e);
                session.sync();
                return true;
            }
            if (state.editor.lockSelection) return false;
            const grid = state.obstacleGrid;
            const idx = grid.worldToIdx(world.x, world.y);
            if (idx !== -1 && grid.hasFloorOccupancy(idx)) {
                session.select({ kind: "floor", idx });
                return true;
            }
            return false;
        },
    };
    const gestureTool = {
        isActive: () => true,
        capturesPointerMove: () => gestures.capturesPointerMove(),
        onPointerMove(_world, e) {
            gestures.onPointerMove(_world, e);
        },
        onPointerUp(world, e) {
            return gestures.onPointerUp(world, e);
        },
    };
    return { modifierTool, interactTool, gestureTool };
}
export function buildSandboxOverlayCommands({ state, session, spatialFrame, placePreviewWorld, marqueeRect, behaviorById, getPropBehaviorId, resolveBehavior, selectedProp }) {
    const commands = [];
    const viewport = state.viewport;
    const sel = session.getSelection();
    let visibleSelectedProps = [];
    if (sel?.kind === "prop") {
        const selectedIds = new Set(selectionPropIds(sel));
        visibleSelectedProps = queryPropsInView(state.entityRegistry, viewport, spatialFrame, { tier: "chunks", filterId: "selectedOverlay", match: (prop) => selectedIds.has(prop.id) });
        for (let i = 0; i < visibleSelectedProps.length; i++) {
            const prop = visibleSelectedProps[i];
            if (!isChainSteeringTarget(state, state.sandbox.entityMeta, prop.id)) continue;
            const visual = state.sandbox.entityMeta.getPathVisual(prop.id) ?? SANDBOX_PATH_VISUAL_NORMAL;
            if (visual === "off") continue;
            const activeId = state.sandbox.entityMeta.getActiveBehaviorId(prop.id);
            const isGroundNav = activeId && GROUND_NAV_BEHAVIOR_IDS.has(activeId);
            const behavior = (isGroundNav && behaviorById.get(activeId)) || behaviorById.get(getPropBehaviorId(prop));
            if (!behavior?.getPathOverlay) continue;
            const overlay = behavior.getPathOverlay(prop);
            appendPathOverlayCommands(commands, overlay, state.obstacleGrid, visual);
        }
    }
    appendSelectionOverlayCommands(commands, { selectedProps: visibleSelectedProps, showRings: state.editor.showSelectionRings, selectedFloorIdx: sel?.kind === "floor" ? sel.idx : null, selectedVoxelIdx: sel?.kind === "voxel" ? sel.idx : null, selectedRailEdge: sel?.kind === "rail" ? { idx: sel.idx, side: sel.side } : null, grid: state.obstacleGrid });
    appendMarqueeOverlayCommands(commands, { marqueeRect });
    state.appLaunch?.session?.appendOverlayCommands?.(commands, state, sel);
    const behavior = resolveBehavior();
    if (selectedProp && behavior?.appendOverlayCommands) behavior.appendOverlayCommands(commands, selectedProp);
    return commands;
}
function brightnessToPercent(brightness) {
    return Math.round(brightness * 100);
}
function percentToBrightness(percent) {
    return percent / 100;
}
export function appendCoatFields(body, { tint, brightness, onTintChange, onBrightnessChange }) {
    appendColorField(body, "Tint", { value: tint, onChange: onTintChange });
    appendNumberField(body, "Brightness %", {
        value: brightnessToPercent(brightness),
        step: 5,
        min: 25,
        max: 200,
        onChange: (percent) => {
            onBrightnessChange(percentToBrightness(percent));
            markLabViewDirty();
        },
    });
}
function spawnShapeCoatAccessors(session, spawnAsset) {
    return {
        tint: session.getSpawnVisualOverrideTint(spawnAsset),
        brightness: session.getSpawnVisualOverrideBrightness(),
        onTintChange: (hex) => {
            session.setSpawnVisualOverrideTint(hex);
            markLabViewDirty();
        },
        onBrightnessChange: (brightness) => {
            session.setSpawnVisualOverrideBrightness(brightness);
            markLabViewDirty();
        },
    };
}
function selectedShapeCoatAccessors(selectedProp, asset) {
    return {
        tint: resolvePickerHex(selectedProp, asset),
        brightness: getPropVisualBrightness(selectedProp),
        onTintChange: (hex) => {
            setPropVisualTint(selectedProp, hex);
            markLabViewDirty();
        },
        onBrightnessChange: (brightness) => {
            setPropVisualBrightness(selectedProp, brightness);
            markLabViewDirty();
        },
    };
}
function appendShapeFamilyCoatBlock(body, coatAccessors, resetProp = null) {
    appendCoatFields(body, coatAccessors);
    if (resetProp)
        appendActionRow(body, [
            {
                label: "Reset coat",
                onClick: () => {
                    clearPropVisualOverride(resetProp);
                    markLabViewDirty();
                },
            },
        ]);
}
function appendShapeFamilyRadiusField(body, value, onChange) {
    appendNumberField(body, "Radius", { value, step: 1, min: 1, max: 32, onChange });
}
function appendShapeFamilyBoxFields(body, width, height, onWidthChange, onHeightChange) {
    appendNumberField(body, "Width", { value: width, step: 1, min: 6, max: 128, onChange: onWidthChange });
    appendNumberField(body, "Height", { value: height, step: 1, min: 6, max: 128, onChange: onHeightChange });
}
function appendCrossPinwheelDimensionFields(body, length, thickness, onLengthChange, onThicknessChange) {
    appendNumberField(body, "Cross length", { value: length, step: 2, min: 8, max: 128, onChange: onLengthChange });
    appendNumberField(body, "Cross thickness", { value: thickness, step: 1, min: 2, max: 64, onChange: onThicknessChange });
}
export function appendBallSpawnFields(body, controller, spawnAsset) {
    const session = controller.session;
    appendShapeFamilyRadiusField(body, session.getSpawnBallRadius(spawnAsset), (radius) => session.setSpawnBallRadius(radius));
    appendShapeFamilyCoatBlock(body, spawnShapeCoatAccessors(session, spawnAsset));
}
export function appendBlockSpawnFields(body, controller, spawnAsset) {
    const session = controller.session;
    if (blockPresetUsesResizableFootprint(spawnAsset.id))
        appendShapeFamilyBoxFields(
            body,
            session.getSpawnBoxWidth(),
            session.getSpawnBoxHeight(),
            (width) => session.setSpawnBoxWidth(width),
            (height) => session.setSpawnBoxHeight(height),
        );
    appendShapeFamilyCoatBlock(body, spawnShapeCoatAccessors(session, spawnAsset));
}
export function appendCrossPinwheelSpawnFields(body, controller) {
    const session = controller.session;
    appendCrossPinwheelDimensionFields(
        body,
        session.getSpawnCrossLength(),
        session.getSpawnCrossThickness(),
        (val) => session.setSpawnCrossLength(val),
        (val) => session.setSpawnCrossThickness(val),
    );
}
export function appendShapeFamilySpawnFields(body, controller, spawnId) {
    const spawnAsset = propCatalog[spawnId];
    if (spawnId === "cross_pinwheel") appendCrossPinwheelSpawnFields(body, controller);
    else if (isBallFamilyAsset(spawnAsset)) appendBallSpawnFields(body, controller, spawnAsset);
    else if (isBlockFamilyAsset(spawnAsset)) appendBlockSpawnFields(body, controller, spawnAsset);
}
export function appendBallSelectedFields(body, selectedProp, asset) {
    appendShapeFamilyRadiusField(body, getCirclePropRadius(selectedProp) ?? ballRadiusFromAsset(asset), (radius) => {
        setCirclePropRadius(selectedProp, radius);
        markLabViewDirty();
    });
    appendShapeFamilyCoatBlock(body, selectedShapeCoatAccessors(selectedProp, asset), selectedProp);
}
export function appendBlockSelectedFields(body, selectedProp, asset) {
    if (blockPresetUsesResizableFootprint(asset.id)) {
        const span = propFootprintHalfExtents(selectedProp);
        appendShapeFamilyBoxFields(
            body,
            Math.round(span.x * 2),
            Math.round(span.y * 2),
            (width) => {
                const next = propFootprintHalfExtents(selectedProp);
                applyPropBoxFootprint(selectedProp, width / 2, next.y);
                markLabViewDirty();
            },
            (height) => {
                const next = propFootprintHalfExtents(selectedProp);
                applyPropBoxFootprint(selectedProp, next.x, height / 2);
                markLabViewDirty();
            },
        );
    }
    appendShapeFamilyCoatBlock(body, selectedShapeCoatAccessors(selectedProp, asset), selectedProp);
}
export function appendCrossPinwheelSelectedFields(body, selectedProp, asset) {
    const length = selectedProp.crossLength ?? 32;
    const thickness = selectedProp.crossThickness ?? 8;
    appendCrossPinwheelDimensionFields(
        body,
        length,
        thickness,
        (val) => {
            applyCrossPinwheelFootprint(selectedProp, val, selectedProp.crossThickness ?? 8);
            markLabViewDirty();
        },
        (val) => {
            applyCrossPinwheelFootprint(selectedProp, selectedProp.crossLength ?? 32, val);
            markLabViewDirty();
        },
    );
    appendShapeFamilyCoatBlock(body, selectedShapeCoatAccessors(selectedProp, asset), selectedProp);
}
export function appendShapeFamilySelectedFields(body, selectedProp) {
    if (!selectedProp) return;
    const asset = propCatalog[selectedProp.type];
    if (selectedProp.type === "cross_pinwheel") appendCrossPinwheelSelectedFields(body, selectedProp, asset);
    else if (isBallFamilyAsset(asset)) appendBallSelectedFields(body, selectedProp, asset);
    else if (isBlockFamilyAsset(asset)) appendBlockSelectedFields(body, selectedProp, asset);
}
function applyWorldPropFacing(prop, degrees) {
    prop.facing = (degrees * Math.PI) / 180;
    prop.angularVelocity = 0;
}
function applyWorldPropPosition(prop, { x, y }) {
    if (x != null) prop.x = x;
    if (y != null) prop.y = y;
    if (prop.strategy?.isKinetic) wakeKineticBody(prop);
}
function appendChainLinkInspector(body, chain) {
    appendCheckboxField(body, "Chain head", { name: "chainHead", checked: chain.isChainHead(), onChange: (checked) => chain.setChainHead(checked) });
}
function appendSandboxWorldPropInspectorFields(body, prop, { state, onChange }) {
    const patch = (apply) => {
        apply();
        onChange();
    };
    appendTranslateFields(body, { x: prop.x, y: prop.y, onPatch: (pos) => patch(() => applyWorldPropPosition(prop, pos)) });
    appendNumberField(body, "Facing (°)", { value: Math.round(((prop.facing ?? 0) * 180) / Math.PI), step: 5, onChange: (degrees) => patch(() => applyWorldPropFacing(prop, degrees)) });
}
const EDGE_SIDE_OPTIONS = [
    { value: "0", label: formatGridWallEdgeSideLabel(0) },
    { value: "1", label: formatGridWallEdgeSideLabel(1) },
    { value: "2", label: formatGridWallEdgeSideLabel(2) },
    { value: "3", label: formatGridWallEdgeSideLabel(3) },
];
function maxWallHeightLevel(state) {
    return state.worldSurfaces.settings.maxWallHeightLevel;
}
export function appendRailWallHeightSlider(body, state, heightLevel, onChange) {
    body.appendChild(new SliderControl("Rail height", 1, maxWallHeightLevel(state), 1, heightLevel, onChange).element);
}
export function appendRailWallThicknessSlider(body, controller, thicknessLevel, onChange) {
    body.appendChild(new SliderControl("Rail thickness", 1, 8, 1, thicknessLevel, onChange).element);
}
export function appendWallPlaceParams(body, state, controller, { wallStampMode, inspector }) {
    const session = controller.session;
    const selectedVoxelInfo = inspector?.kind === "voxel" ? inspector.data : null;
    const selectedRailInfo = inspector?.kind === "rail" ? inspector.data : null;
    appendEditorHint(body, "Click the map to place or select walls. Right-click to delete under the cursor.");
    appendActionRow(body, [{ label: "Add at camera", onClick: () => session.stampWallAtCameraOrigin() }]);
    const maxHeight = maxWallHeightLevel(state);
    body.appendChild(
        new SliderControl("Height", 1, maxHeight, 1, session.getWallHeightLevel(), (val) => {
            session.setWallHeightLevel(val);
            if (selectedVoxelInfo) session.setSelectedVoxelWallHeight(val);
            else if (selectedRailInfo) session.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
        }).element,
    );
    if (wallStampMode === "rail")
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, session.getRailThicknessLevel(), (val) => {
                session.setRailThicknessLevel(val);
                if (selectedRailInfo) session.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
            }).element,
        );
}
export function appendWallSelectedInspector(body, state, controller, { voxel: selectedVoxelInfo, rail: selectedRailInfo } = {}) {
    const session = controller.session;
    if (selectedVoxelInfo) {
        appendEditorHint(body, `Voxel block · height ${selectedVoxelInfo.heightLevel}. Change height below or delete.`);
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(state), 1, selectedVoxelInfo.heightLevel, (val) => {
                session.setSelectedVoxelWallHeight(val);
            }).element,
        );
        appendActionRow(body, [{ label: "Delete voxel", onClick: () => session.deleteSelectedWall() }]);
        return true;
    }
    if (selectedRailInfo) {
        appendEditorHint(body, `Rail wall · ${selectedRailInfo.sideLabel} · height ${selectedRailInfo.heightLevel}.`);
        appendSelectField(body, "Side", {
            value: String(selectedRailInfo.side),
            options: [0, 1, 2, 3].map((side) => ({ value: String(side), label: formatGridWallEdgeSideLabel(side) })),
            onChange: (value) => {
                session.setSelectedRailWallSide(Number(value));
            },
        });
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(state), 1, selectedRailInfo.heightLevel, (val) => {
                session.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
            }).element,
        );
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, selectedRailInfo.thicknessLevel, (val) => {
                session.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
            }).element,
        );
        appendActionRow(body, [{ label: "Delete rail", onClick: () => session.deleteSelectedWall() }]);
        return true;
    }
    return false;
}
export const SANDBOX_PALETTE_TAG_FILTERS = [
    { id: "all", label: "All" },
    { id: "shapes", label: "Shapes" },
    { id: "nav", label: "Nav" },
    { id: "gen", label: "Gen" },
    { id: "rooms", label: "Rooms" },
];
const PLACE_PALETTE_TAGS_BY_KEY = { "wall:voxel": ["gen"], "wall:rail": ["gen"], "gen:cavern": ["gen"], "gen:rail": ["gen"], "gen:railMaze": ["gen"], "gen:erase": ["gen"] };
function resolvePlacePaletteTags(paletteKey, asset = null) {
    const keyed = PLACE_PALETTE_TAGS_BY_KEY[paletteKey];
    if (keyed) return keyed;
    if (paletteKey.startsWith("prop:")) return sandboxAssetTags(asset ?? propCatalog[paletteKey.slice(5)]);
    return [];
}
export function sandboxTagFilterLabel(filterId) {
    const option = SANDBOX_PALETTE_TAG_FILTERS.find((entry) => entry.id === filterId);
    return option?.label.toLowerCase() ?? filterId;
}
const WALL_STAMP_OPTIONS = [
    { value: "voxel", label: "Voxel block" },
    { value: "rail", label: "Rail wall" },
];
const WALL_PALETTE_SWATCHES = { voxel: "#78716c", rail: "#57534e" };
const MAP_GEN_PALETTE_OPTIONS = [
    { key: "gen:cavern", genKind: "cavern", label: "Cavern generation", swatch: "#ff9800", glyph: "Cv" },
    { key: "gen:rail", genKind: "rail", label: "Rail wall generation", swatch: "#e040fb", glyph: "Rw" },
    { key: "gen:railMaze", genKind: "railMaze", label: "Rail maze generation", swatch: "#ba68c8", glyph: "Rz" },
    { key: "gen:erase", genKind: "erase", label: "Wall eraser", swatch: "#f44336", glyph: "Er" },
];
function resolvePropPaletteSwatch(asset) {
    const colors = asset?.visuals?.colors;
    return colors?.bodyInspect ?? colors?.top ?? colors?.side ?? "#64748b";
}
export function buildPlacePaletteItems(propIds) {
    const items = [];
    for (let i = 0; i < propIds.length; i++) {
        const id = propIds[i];
        const asset = propCatalog[id];
        const label = formatSandboxSpawnLabel(id);
        const key = `prop:${id}`;
        items.push({ key, kind: "prop", label, swatch: resolvePropPaletteSwatch(asset), glyph: label.slice(0, 2), tags: resolvePlacePaletteTags(key, asset) });
    }
    for (let i = 0; i < WALL_STAMP_OPTIONS.length; i++) {
        const option = WALL_STAMP_OPTIONS[i];
        const key = `wall:${option.value}`;
        items.push({ key, kind: "wall", label: option.label, swatch: WALL_PALETTE_SWATCHES[option.value], glyph: option.label.slice(0, 1), tags: resolvePlacePaletteTags(key) });
    }
    for (let i = 0; i < MAP_GEN_PALETTE_OPTIONS.length; i++) {
        const option = MAP_GEN_PALETTE_OPTIONS[i];
        items.push({ key: option.key, kind: "gen", genKind: option.genKind, label: option.label, swatch: option.swatch, glyph: option.glyph, tags: resolvePlacePaletteTags(option.key) });
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
}
export function appendSandboxTagFilters(head, activeFilter, onChange, ariaLabel = "Tag filters") {
    const row = document.createElement("div");
    row.className = "sandbox-palette-filter-group";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", ariaLabel);
    for (let i = 0; i < SANDBOX_PALETTE_TAG_FILTERS.length; i++) {
        const option = SANDBOX_PALETTE_TAG_FILTERS[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sandbox-palette-filter-btn";
        btn.textContent = option.label;
        btn.setAttribute("role", "radio");
        const active = activeFilter === option.id;
        btn.setAttribute("aria-checked", String(active));
        btn.classList.toggle("is-active", active);
        btn.addEventListener("click", () => {
            if (activeFilter !== option.id) onChange(option.id);
        });
        row.appendChild(btn);
    }
    head.appendChild(row);
}
export function appendSpawnPaletteGrid(parent, items, activeKey, onSelect) {
    const grid = document.createElement("div");
    grid.className = "spawn-palette-grid";
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "spawn-palette-tile";
        btn.setAttribute("aria-pressed", String(item.key === activeKey));
        if (item.key === activeKey) btn.classList.add("is-active");
        const icon = document.createElement("div");
        icon.className = "spawn-palette-icon";
        icon.style.setProperty("--swatch", item.swatch);
        icon.textContent = item.glyph;
        const label = document.createElement("span");
        label.className = "spawn-palette-label";
        label.textContent = item.label;
        btn.append(icon, label);
        btn.addEventListener("click", () => onSelect(item.key));
        grid.appendChild(btn);
    }
    parent.appendChild(grid);
}
export function appendSandboxSelectionPanel(body, controller, refreshPanel) {
    const session = controller.session;
    const selection = session.getSelection();
    const filter = session.getSelectionTagFilter();
    const selectedProps = session.listSelectedPropEntries();
    appendEditorHint(body, "Shift+drag to box-select. Ctrl+click a prop to add or remove it from the selection.");
    const actions = [
        {
            label: filter === "all" ? "Select all props" : `Select all ${sandboxTagFilterLabel(filter)}`,
            onClick: () => {
                session.selectAllPropsWithTagFilter(filter);
                refreshPanel();
            },
        },
    ];
    if (selection?.kind === "prop" && selectedProps.length > 0)
        actions.push({
            label: filter === "all" ? "Filter selection" : `Filter selection to ${sandboxTagFilterLabel(filter)}`,
            onClick: () => {
                session.filterPropSelectionToTag(filter);
                refreshPanel();
            },
        });
    appendActionRow(body, actions);
    appendInstanceList(
        body,
        selectedProps.map((entry) => ({
            label: entry.label,
            selected: true,
            onSelect: () => {
                session.select({ kind: "prop", ids: [entry.id] });
                refreshPanel();
            },
            onRemove: () => {
                session.removePropFromSelection(entry.id);
                refreshPanel();
            },
            onDelete: () => {
                controller.deletePropById(entry.id);
                refreshPanel();
            },
        })),
        selection?.kind === "prop" ? "No props in selection." : "Select props on the map.",
    );
}
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
function appendBehaviorModeField(parent, behaviorIds, value, onChange) {
    if (behaviorIds.length === 0) return;
    appendSelectField(parent, "Mode", { value, options: behaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })), onChange });
}
export function appendSelectedPropInspector(body, state, controller, selectedProp, refreshPanel) {
    const behaviorIds = controller.listSelectedBehaviors();
    appendFactionSelect(body, {
        value: selectedProp.faction,
        onChange: (faction) => {
            selectedProp.faction = faction;
            refreshPanel();
        },
    });
    appendSandboxWorldPropInspectorFields(body, selectedProp, { state, onChange: refreshPanel });
    if (isBallFamilyAsset(propCatalog[selectedProp.type]) || isBlockFamilyAsset(propCatalog[selectedProp.type])) appendShapeFamilySelectedFields(body, selectedProp);
    if (isChainLinkBall(selectedProp)) appendChainLinkInspector(body, { isChainHead: () => controller.session.isSelectedChainHead(), setChainHead: (enabled) => controller.session.setSelectedChainHead(enabled) });
    appendBehaviorModeField(body, behaviorIds, controller.getSelectedBehaviorId(), (value) => {
        controller.setSelectedBehaviorId(value);
    });
    const selectedAsset = propCatalog[selectedProp.type];
    if (isSpawnerProp(selectedAsset)) {
        const spawnPropIds = listSpawnerSpawnPropIds();
        if (spawnPropIds.length)
            appendSelectField(body, "Spawn prop", {
                value: resolveSpawnerPropId(selectedProp, selectedAsset),
                options: spawnPropIds.map((id) => ({ value: id, label: formatSandboxSpawnLabel(id) })),
                onChange: (value) => {
                    selectedProp.sandboxSpawnerPropId = value;
                    refreshPanel();
                },
            });
    }
    appendCheckboxField(body, "Focus", {
        name: "cameraFocus",
        checked: controller.isCameraTarget(selectedProp),
        onChange: (checked) => {
            controller.setCameraTarget(checked, selectedProp);
        },
    });
    appendSelectField(body, "Path visual", {
        value: controller.getPathVisual(selectedProp),
        options: SANDBOX_PATH_VISUAL_OPTIONS.map((optionId) => ({ value: optionId, label: SANDBOX_PATH_VISUAL_LABELS[optionId] })),
        onChange: (value) => {
            controller.setPathVisual(value, selectedProp);
        },
    });
}
function appendFloorBeltSelectedInspector(body, controller, selectedFloorBelt) {
    const session = controller.session;
    appendEditorHint(body, `${BeltPacked.label(selectedFloorBelt.packed)}. Change orientation, idx, or rotation below. Move is blocked when the target has a wall or belt.`);
    appendSelectField(body, "Orientation", {
        value: String(selectedFloorBelt.packed),
        options: BeltPacked.orientationOptions().map((option) => ({ value: String(option.packed), label: option.label })),
        onChange: (value) => {
            session.setSelectedFloorBeltPacked(Number(value));
        },
    });
    appendNumberField(body, "Idx", {
        value: selectedFloorBelt.idx,
        step: 1,
        onChange: (idx) => {
            session.moveSelectedFloorBeltTo(idx);
        },
    });
    appendActionRow(body, [
        { label: "Rotate left", onClick: () => session.rotateSelectedFloorBelt(-1) },
        { label: "Rotate right", onClick: () => session.rotateSelectedFloorBelt(1) },
    ]);
    appendActionRow(body, [{ label: "Delete belt", onClick: () => session.deleteSelectedFloorCell() }]);
}
const INSPECTOR_UI = {
    props(body, state, controller, data) {
        const count = data.ids.length;
        appendEditorHint(body, `${count} props selected.`);
        appendActionRow(body, [{ label: `Delete ${count} props`, onClick: () => controller.deleteSelectedProps() }]);
    },
    prop(body, state, controller, data, refreshPanel) {
        appendSelectedPropInspector(body, state, controller, data, refreshPanel);
    },
    floorBelt(body, state, controller, data) {
        appendFloorBeltSelectedInspector(body, controller, data);
    },
    voxel(body, state, controller, data) {
        appendWallSelectedInspector(body, state, controller, { voxel: data });
    },
    rail(body, state, controller, data) {
        appendWallSelectedInspector(body, state, controller, { rail: data });
    },
};
for (const key of PLACEABLE_INSPECTOR_KINDS) if (!INSPECTOR_UI[key]) throw new Error(`Missing inspector UI for placeable kind: ${key}`);
if (!INSPECTOR_UI.props) throw new Error("Missing inspector UI for placeable kind: props");
export function appendSelectionInspector(body, state, controller, inspector, refreshPanel) {
    INSPECTOR_UI[inspector.kind](body, state, controller, inspector.data, refreshPanel);
}
function appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera }) {
    const session = controller.session;
    const addRow = document.createElement("div");
    addRow.className = "sandbox-add-row";
    if (spawnAsset && !isGridFloorBeltSpawnAsset(spawnAsset))
        appendFactionSelect(addRow, {
            value: session.getSpawnFaction(),
            onChange: (faction) => {
                session.setSpawnFaction(faction);
                refreshPanel();
            },
        });
    const spawnBehaviorIds = controller.listSpawnBehaviors();
    if (isSingleWorldPropSpawnAsset(spawnAsset) && spawnBehaviorIds.length > 0)
        appendBehaviorModeField(addRow, spawnBehaviorIds, controller.getSpawnBehaviorId(), (value) => {
            controller.setSpawnBehaviorId(value);
        });
    if (showAddAtCamera) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "secondary";
        addBtn.textContent = "Add at camera";
        addBtn.addEventListener("click", () => controller.spawnAtCameraOrigin());
        addRow.appendChild(addBtn);
    }
    body.appendChild(addRow);
}
export function appendPropPlaceParams(body, controller, spawnId, refreshPanel) {
    const session = controller.session;
    const spawnAsset = propCatalog[spawnId];
    if (spawnId === "snake") {
        appendNumberField(body, "Length", {
            value: session.getSpawnSnakeLength(),
            step: 1,
            min: 3,
            max: 9,
            onChange: (length) => {
                session.setSpawnSnakeLength(length);
            },
        });
        appendNumberField(body, "Radius", {
            value: session.getSpawnBallRadius(spawnAsset),
            step: 1,
            min: 1,
            max: 4,
            onChange: (radius) => {
                session.setSpawnBallRadius(Math.max(1, Math.min(4, radius)));
            },
        });
        appendCoatFields(body, {
            tint: session.getSpawnVisualOverrideTint(spawnAsset),
            brightness: session.getSpawnVisualOverrideBrightness(),
            onTintChange: (hex) => {
                session.setSpawnVisualOverrideTint(hex);
                markLabViewDirty();
            },
            onBrightnessChange: (brightness) => {
                session.setSpawnVisualOverrideBrightness(brightness);
                markLabViewDirty();
            },
        });
    } else if (isBallFamilyAsset(spawnAsset) || isBlockFamilyAsset(spawnAsset)) appendShapeFamilySpawnFields(body, controller, spawnId);
    appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera: true });
}
export function createSandboxController(state, { getCanvas, clientToWorld, behaviors }) {
    syncSandboxBehaviorById(state, behaviors);
    const session = createSandboxSession(state);
    const cameraCycler = new FollowCamera(state);
    cameraCycler.registerCandidateList(() => session.listPlacedProps());
    cameraCycler.addOnTargetChanged(() => session.sync());
    const behaviorById = state.sandbox.behaviorById;
    let spawnBehaviorId = behaviors[0]?.id ?? "";
    let unbindPointers = null;
    let unbindContextMenu = null;
    let unbindKeyDown = null;
    let placePreviewWorld = null;
    const entityMeta = () => state.sandbox.entityMeta;
    const spawnAsset = () => propCatalog[session.getSpawnPropId()];
    const clampBehaviorId = (id, allowed) => {
        if (allowed.length === 0) return id;
        return allowed.includes(id) ? id : allowed[0];
    };
    const listSpawnBehaviors = () => {
        const asset = spawnAsset();
        if (isGridFloorBeltSpawnAsset(asset)) return [];
        return resolveSandboxBehaviors(asset, state, null);
    };
    const clampSpawnBehavior = () => {
        spawnBehaviorId = clampBehaviorId(spawnBehaviorId, listSpawnBehaviors());
    };
    const listSelectedBehaviors = (prop = session.getSelectedProp()) => {
        if (!prop) return [];
        return resolveSandboxBehaviors(propCatalog[prop.type], state, prop);
    };
    const getPropBehaviorId = (prop) => {
        const allowed = listSelectedBehaviors(prop);
        if (allowed.length === 0) return spawnBehaviorId;
        return clampBehaviorId(entityMeta().getActiveBehaviorId(prop.id) ?? spawnBehaviorId, allowed);
    };
    const stampPropBehavior = (prop) => {
        if (!prop) return;
        const allowed = listSelectedBehaviors(prop);
        if (allowed.length === 0) return;
        entityMeta().setActiveBehaviorId(prop.id, clampBehaviorId(spawnBehaviorId, allowed));
    };
    const MARQUEE_AABB = createAabb();
    const gestures = createSandboxPointerGestures({ getCanvas, session, clientToWorld });
    const wallPlaceTool = {
        isActive: () => session.isWallPlaceMode(),
        blocksPlacement: () => session.isWallPlaceMode(),
        onPointerDown(world, e) {
            if (e.button === 2) {
                session.deleteWallAtWorld(world.x, world.y);
                return true;
            }
            if (e.button !== 0) return false;
            if (session.pickWallAtWorld(world.x, world.y)) return true;
            session.stampWallAtWorld(world.x, world.y);
            return true;
        },
    };
    const blocksPlacement = () => wallPlaceTool.isActive() && wallPlaceTool.blocksPlacement();
    const dismissEditorFocus = () => {
        groundNavContextMenu.close();
        marqueeTool.cancel();
        placePreviewWorld = null;
        session.clearSelection();
        session.clearPlaceMode();
        session.sync();
    };
    const selectProp = (id) => {
        session.select(id == null ? null : { kind: "prop", ids: [id] });
        const prop = session.getSelectedProp();
        if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
            const allowed = listSelectedBehaviors(prop);
            if (allowed.length > 0) entityMeta().setActiveBehaviorId(prop.id, allowed[0]);
        }
    };
    const togglePropInSelection = (id) => {
        const sel = session.getSelection();
        const removing = sel?.kind === "prop" && sel.ids.has(id);
        if (!session.togglePropInSelection(id)) return;
        if (!removing) {
            const prop = state.entityRegistry.getLive(id);
            if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
                const allowed = listSelectedBehaviors(prop);
                if (allowed.length > 0) entityMeta().setActiveBehaviorId(prop.id, allowed[0]);
            }
        }
        session.sync();
    };
    const selectPropIds = (ids) => {
        session.select({ kind: "prop", ids });
    };
    const resolveBehavior = () => {
        const prop = session.getSelectedProp();
        if (!prop) return null;
        const allowed = listSelectedBehaviors(prop);
        const behavior = behaviorById.get(getPropBehaviorId(prop)) ?? null;
        if (!behavior || !allowed.includes(behavior.id)) return null;
        return behavior;
    };
    const resolveGroundMove = () => {
        const sel = session.getSelection();
        if (sel?.kind !== "prop") return null;
        const prop = resolveGroundNavSteeringProp(state, entityMeta(), selectionPropIds(sel));
        if (!prop || prop.type === "boid_triangle") return null;
        const allowed = listSelectedBehaviors(prop);
        const behavior = behaviorById.get(clampBehaviorId(entityMeta().getActiveBehaviorId(prop.id) ?? spawnBehaviorId, allowed)) ?? null;
        if (!behavior?.setMoveTarget || !allowed.includes(behavior.id)) return null;
        return { prop, behavior };
    };
    const issueGroundMove = (move, world) => {
        move.behavior.setMoveTarget(move.prop, world);
    };
    const issueGroundNavToSelected = (behaviorId, world) => {
        const sel = session.getSelection();
        if (sel?.kind !== "prop") return 0;
        const moved = issueGroundNavToSelection(state, { propIds: selectionPropIds(sel), behaviorId, world, behaviorById, entityMeta: entityMeta() });
        if (moved > 0) session.sync();
        return moved;
    };
    const groundNavContextMenu = createSandboxGroundNavContextMenu(state, session, { behaviorById, entityMeta, onIssued: () => session.sync() });
    const deletePointerTool = createSandboxDeletePointerTool(state, session);
    const { modifierTool, interactTool, gestureTool } = createSandboxPrimaryPointerTools(state, session, { stampPropBehavior, blocksPlacement, resolveBehavior, resolveGroundMove, gestures, issueGroundNavToSelected });
    const marqueeTool = createSandboxMarqueeTool(state, session, { getCanvas, aabbScratch: MARQUEE_AABB, stampPropBehavior, selectPropIds });
    const canvasTools = createCanvasToolStack([modifierTool, wallPlaceTool, deletePointerTool, interactTool, gestureTool, marqueeTool], { clientToWorld });
    const resetBehaviors = () => {
        for (const behavior of behaviors) behavior.reset?.();
        gestures.reset();
    };
    const onPointerDown = (e) => {
        const world = clientToWorld(e.clientX, e.clientY);
        const down = canvasTools.dispatchPointerDown(world, e);
        if (down.handled) {
            if (down.preventDefault) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (canvasTools.tryBeginPointerDown(world, e)) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    const onPointerMove = (e) => {
        const world = clientToWorld(e.clientX, e.clientY);
        canvasTools.dispatchPointerMove(world, e);
        if (!canvasTools.capturesPointerMove() && !canvasTools.isDragging() && !canvasTools.blocksPlacePreview() && !session.isMapGenPlaceMode()) placePreviewWorld = world;
        if (canvasTools.isDragging()) return;
    };
    const onPointerLeave = () => {
        placePreviewWorld = null;
    };
    const onPointerUp = (e) => {
        const world = clientToWorld(e.clientX, e.clientY);
        if (canvasTools.dispatchPointerUp(world, e)) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    const controller = {
        deleteSelectedProps: () => {
            const sel = session.getSelection();
            if (sel?.kind === "prop") for (const propId of sel.ids) cameraCycler.retarget(propId);
            session.deleteSelectedProps();
        },
        countSelectedNavProps: () => {
            const sel = session.getSelection();
            if (sel?.kind !== "prop") return 0;
            return countNavPropsInSelection(state, selectionPropIds(sel), entityMeta());
        },
        issueGroundNavToSelection: issueGroundNavToSelected,
        spawnAtCameraOrigin: () => {
            session.spawnAtCameraOrigin();
            stampPropBehavior(session.getSelectedProp());
        },
        deletePropById: (id) => {
            cameraCycler.retarget(id);
            session.deletePropById(id);
        },
        setPlacePaletteKey: (key) => {
            const prevKey = session.getPlacePaletteKey();
            session.setPlacePaletteKey(key);
            if (prevKey === key) return;
            if (key.startsWith("prop:")) {
                clampSpawnBehavior();
                const asset = propCatalog[key.slice(5)];
                if (isBallFamilyAsset(asset)) session.setSpawnBallRadius(ballRadiusFromAsset(asset));
            }
        },
        selectSceneItem: (item) => {
            session.selectSceneItem(item);
        },
        exportSceneSnapshot: () => JSON.stringify(collectSandboxSceneSnapshot(state), null, 2),
        importSceneSnapshot(json) {
            applySandboxSceneSnapshot(state, parseSandboxSceneSnapshot(json));
            cameraCycler.clear();
            resetBehaviors();
            session.clearSelection();
            session.seedPlacementOrderFromState();
            session.sync();
        },
        setUiSync: (fn) => session.setUiSync(fn),
        session,
        getSpawnBehaviorId: () => spawnBehaviorId,
        setSpawnBehaviorId: (id) => {
            spawnBehaviorId = clampBehaviorId(id, listSpawnBehaviors());
            session.sync();
        },
        listSpawnBehaviors,
        getSelectedBehaviorId: () => {
            const prop = session.getSelectedProp();
            return prop ? getPropBehaviorId(prop) : spawnBehaviorId;
        },
        setSelectedBehaviorId: (id) => {
            const prop = session.getSelectedProp();
            if (!prop) return;
            entityMeta().setActiveBehaviorId(prop.id, clampBehaviorId(id, listSelectedBehaviors(prop)));
            session.sync();
        },
        listSelectedBehaviors: () => listSelectedBehaviors(),
        register() {
            controller.destroy();
            unbindPointers = bindCanvasPointers(getCanvas(), { pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerUp, pointercancel: onPointerUp, pointerleave: onPointerLeave });
            unbindContextMenu = bindCanvasContextMenu(getCanvas(), (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (state.editor.lockSelection) return;
                if (session.isWallPlaceMode()) return;
                const world = clientToWorld(e.clientX, e.clientY);
                groundNavContextMenu.tryOpen(e.clientX, e.clientY, world);
            });
            const onKeyDown = (e) => {
                if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
                if (e.code === "Escape") {
                    if (groundNavContextMenu.isOpen()) {
                        groundNavContextMenu.close();
                        e.preventDefault();
                        return;
                    }
                    dismissEditorFocus();
                    e.preventDefault();
                    return;
                }
                if (!placePreviewWorld || canvasTools.capturesPointerMove() || canvasTools.isDragging() || canvasTools.blocksPlacePreview()) return;
                if (session.rotateHoveredGridOccupantAtWorld(placePreviewWorld.x, placePreviewWorld.y)) e.preventDefault();
            };
            window.addEventListener("keydown", onKeyDown);
            unbindKeyDown = () => window.removeEventListener("keydown", onKeyDown);
            cameraCycler.bindInput();
        },
        destroy() {
            unbindKeyDown?.();
            unbindKeyDown = null;
            unbindPointers?.();
            unbindPointers = null;
            unbindContextMenu?.();
            unbindContextMenu = null;
            groundNavContextMenu.close();
            marqueeTool.cancel();
            placePreviewWorld = null;
            resetBehaviors();
            session.setUiSync(null);
            cameraCycler.destroy();
        },
        clearBodies() {
            session.clear();
            cameraCycler.clear();
            resetBehaviors();
        },
        collectOverlayCommands() {
            const showPlacePreview = placePreviewWorld && !canvasTools.capturesPointerMove() && !canvasTools.isDragging() && !canvasTools.blocksPlacePreview() && !session.isMapGenPlaceMode();
            return buildSandboxOverlayCommands({ state, session, spatialFrame: state.spatialFrame, placePreviewWorld: showPlacePreview ? placePreviewWorld : null, marqueeRect: marqueeTool.getMarqueeRect(), behaviorById, getPropBehaviorId, resolveBehavior, selectedProp: session.getSelectedProp() });
        },
        tick(dtMs) {
            session.pruneSelection();
            for (let i = 0; i < behaviors.length; i++) behaviors[i].tickWorld?.(dtMs);
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            if (!prop || !behavior?.tick) return;
            if (behavior.tickWorld) return;
            behavior.tick(prop, dtMs);
        },
        getPathVisual(prop) {
            return state.sandbox.entityMeta.getPathVisual(prop.id) ?? SANDBOX_PATH_VISUAL_NORMAL;
        },
        setPathVisual(visual, prop) {
            state.sandbox.entityMeta.setPathVisual(prop.id, visual);
            session.sync();
        },
        isCameraTarget(prop) {
            return cameraCycler.targetProp?.id === prop.id;
        },
        setCameraTarget(enabled, prop) {
            if (enabled) cameraCycler.focus(prop);
            else if (cameraCycler.targetProp === prop) cameraCycler.clear();
            session.sync();
        },
    };
    return controller;
}
