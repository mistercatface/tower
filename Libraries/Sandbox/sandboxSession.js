import { WorldProp } from "../../Entities/WorldProp.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { spawnAssembly, deleteAssemblyInstance, clearAssemblyInstances } from "./spawnAssembly.js";
import { getResolvedAssembly, listAssemblyManifests } from "./assemblies/assemblyRegistry.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { removeSandboxWorldProp } from "./pullFixtureWalls.js";
import { isGridFloorBeltSpawnAsset, resolveFloorBeltKindFromSpawnAsset } from "./sandboxCapabilities.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
export const SANDBOX_SPAWN_ASSEMBLY_PREFIX = "assembly:";
/** @param {string} assemblyId */
export function sandboxSpawnAssemblyId(assemblyId) {
    return `${SANDBOX_SPAWN_ASSEMBLY_PREFIX}${assemblyId}`;
}
/** @param {string} spawnId */
export function isSandboxSpawnPropId(spawnId) {
    return !spawnId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX);
}
/**
 * @param {object} state
 * @param {{ requestRedraw: () => void, defaultSpawnPropId: string }} options
 */
export function createSandboxSession(state, { requestRedraw, defaultSpawnPropId }) {
    let spawnPropId = defaultSpawnPropId;
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    /** @type {Set<number>} */
    let selectedPropIds = new Set();
    /** @type {number | null} */
    let selectedPropId = null;
    /** @type {(() => void) | null} */
    let uiSync = null;
    const sync = () => {
        requestRedraw();
        uiSync?.();
    };
    const registry = () => state.entityRegistry;
    const meta = () => getSandboxEntityMeta(state);
    const syncPrimaryFromSet = () => {
        if (selectedPropIds.size === 0) {
            selectedPropId = null;
            return;
        }
        if (selectedPropId != null && selectedPropIds.has(selectedPropId) && registry().getLive(selectedPropId)) return;
        for (const id of selectedPropIds)
            if (registry().getLive(id)) {
                selectedPropId = id;
                return;
            }
        selectedPropIds.clear();
        selectedPropId = null;
    };
    const setSinglePropSelection = (id) => {
        if (id == null) {
            selectedPropIds.clear();
            selectedPropId = null;
            sync();
            return;
        }
        selectedPropIds = new Set([id]);
        selectedPropId = id;
        sync();
    };
    const removeProp = (prop) => removeSandboxWorldProp(state, prop);
    const pruneSelection = () => {
        if (selectedPropIds.size === 0) return;
        let changed = false;
        for (const id of selectedPropIds)
            if (!registry().getLive(id)) {
                selectedPropIds.delete(id);
                changed = true;
            }
        if (changed) {
            syncPrimaryFromSet();
            uiSync?.();
        }
    };
    const removePropFromSelection = (propId) => {
        if (!selectedPropIds.delete(propId)) return;
        if (selectedPropId === propId) syncPrimaryFromSet();
    };
    const spawnAt = (worldX, worldY) => {
        if (!isSandboxSpawnPropId(spawnPropId) || !getPropAsset(spawnPropId)) return null;
        const asset = getPropAsset(spawnPropId);
        if (isGridFloorBeltSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (findGridAnchoredFloorPropAtCell(state.entityRegistry, col, row) || grid.hasFloorOccupancy(col, row)) return null;
            const kind = resolveFloorBeltKindFromSpawnAsset(asset);
            if (!grid.writeFloorCell(col, row, kind, 0)) return null;
            sync();
            return null;
        }
        const prop = new WorldProp(worldX, worldY, spawnPropId, 0);
        prop.faction = spawnFaction;
        addWorldPropToState(state, prop);
        setSinglePropSelection(prop.id);
        return prop;
    };
    return {
        getSpawnPropId: () => spawnPropId,
        setSpawnPropId: (id) => {
            spawnPropId = id;
        },
        getSpawnFaction: () => spawnFaction,
        setSpawnFaction: (faction) => {
            spawnFaction = faction;
        },
        getSelectedPropId: () => selectedPropId,
        getSelectedPropIds: () => {
            pruneSelection();
            return [...selectedPropIds];
        },
        setSelectedPropId: (id) => {
            setSinglePropSelection(id);
        },
        setSelectedPropIds: (ids) => {
            selectedPropIds = new Set();
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                if (registry().getLive(id) && !meta().hasAssemblyMembership(id)) selectedPropIds.add(id);
            }
            syncPrimaryFromSet();
            sync();
        },
        clearPropSelection: () => {
            setSinglePropSelection(null);
        },
        getSelectedProp: () => {
            pruneSelection();
            return selectedPropId == null ? null : registry().getLive(selectedPropId);
        },
        pruneSelection,
        spawnAt,
        spawnAtCameraOrigin() {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            if (spawnPropId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX)) return this.spawnAssemblyAt(origin.x, origin.y, spawnPropId.slice(SANDBOX_SPAWN_ASSEMBLY_PREFIX.length));
            return spawnAt(origin.x, origin.y);
        },
        spawnAssemblyAt(centerX, centerY, assemblyId) {
            const instance = spawnAssembly(state, centerX, centerY, assemblyId, { faction: spawnFaction });
            setSinglePropSelection(instance.defaultPropId);
            return instance;
        },
        spawnAssemblyAtCameraOrigin(assemblyId) {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            return this.spawnAssemblyAt(origin.x, origin.y, assemblyId);
        },
        listAssemblyManifests: () => listAssemblyManifests(),
        deleteAssemblyById(assemblyId) {
            const instance = state.sandbox.assemblyInstances.find((entry) => entry.id === assemblyId);
            if (!instance) return;
            deleteAssemblyInstance(state, assemblyId, getResolvedAssembly(instance.assemblyId).groupField);
            pruneSelection();
            sync();
        },
        listAssemblies() {
            return state.sandbox.assemblyInstances.map((entry) => ({ id: entry.id, label: getResolvedAssembly(entry.assemblyId).label, defaultPropId: entry.defaultPropId }));
        },
        deleteProp(prop) {
            if (!prop) return;
            removePropFromSelection(prop.id);
            removeProp(prop);
            sync();
        },
        deletePropById(id) {
            this.deleteProp(registry().get(id));
        },
        deleteSelectedProps() {
            const ids = [...selectedPropIds];
            for (let i = 0; i < ids.length; i++) removeProp(registry().get(ids[i]));
            selectedPropIds.clear();
            selectedPropId = null;
            sync();
        },
        listPlacedProps() {
            const counts = new Map();
            /** @type {{ id: number, type: string, faction: string, label: string }[]} */
            const placed = [];
            registry().forEachOfKind("worldProp", (prop) => {
                if (prop.isDead || getSandboxEntityMeta(state).hasAssemblyMembership(prop.id)) return;
                const typeLabel = (prop.type ?? "prop").replace(/_/g, " ");
                const index = (counts.get(prop.type) ?? 0) + 1;
                counts.set(prop.type, index);
                placed.push({ id: prop.id, type: prop.type, faction: resolveSandboxFaction(prop), label: `${typeLabel} #${index}` });
            });
            return placed;
        },
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state.worldProps[i]);
            state.obstacleGrid.clearAllFloorCells();
            clearAssemblyInstances(state);
            selectedPropIds.clear();
            selectedPropId = null;
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
        getState: () => state,
    };
}
