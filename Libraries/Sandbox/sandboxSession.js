import { WorldProp } from "../../Entities/WorldProp.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { spawnAssembly, deleteAssemblyInstance, clearAssemblyInstances } from "./spawnAssembly.js";
import { getResolvedAssembly, listAssemblyManifests } from "./assemblies/assemblyRegistry.js";
import { clearSandboxPads, deleteSandboxPad, getSandboxPadEditorState, isSandboxSpawnPadId, listSandboxPads, parseSandboxPadPreset, patchSandboxPad, spawnSandboxPad } from "./sandboxPads.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { PAD_PRESETS } from "./padPresets.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
export { SANDBOX_SPAWN_PAD_PREFIX, isSandboxSpawnPadId, parseSandboxPadPreset, sandboxSpawnPadId } from "./sandboxPads.js";
export const SANDBOX_SPAWN_ASSEMBLY_PREFIX = "assembly:";
/** @param {string} assemblyId */
export function sandboxSpawnAssemblyId(assemblyId) {
    return `${SANDBOX_SPAWN_ASSEMBLY_PREFIX}${assemblyId}`;
}
/** @param {string} spawnId */
export function isSandboxSpawnPropId(spawnId) {
    return !isSandboxSpawnPadId(spawnId) && !spawnId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX);
}
/**
 * @param {SandboxHostPort} host
 * @param {{ defaultSpawnPropId: string }} options
 */
export function createSandboxSession(host, { defaultSpawnPropId }) {
    let spawnPropId = defaultSpawnPropId;
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    let spawnPullWidth = PAD_PRESETS.pull.halfWidth * 2;
    let spawnPullHeight = PAD_PRESETS.pull.halfHeight * 2;
    /** @type {number | null} */
    let selectedPropId = null;
    /** @type {string | null} */
    let selectedPadId = null;
    /** @type {(() => void) | null} */
    let uiSync = null;
    const sync = () => {
        host.requestRedraw();
        uiSync?.();
    };
    const registry = () => host.getSimState().entityRegistry;
    const pruneSelection = () => {
        if (selectedPropId == null) return;
        if (!registry().getLive(selectedPropId)) {
            selectedPropId = null;
            uiSync?.();
        }
    };
    const spawnAt = (worldX, worldY) => {
        if (!isSandboxSpawnPropId(spawnPropId) || !getPropAsset(spawnPropId)) return null;
        const prop = new WorldProp(worldX, worldY, spawnPropId, 0);
        prop.faction = spawnFaction;
        host.addProp(prop);
        selectedPropId = prop.id;
        sync();
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
        getSpawnPullSize: () => ({ width: spawnPullWidth, height: spawnPullHeight }),
        setSpawnPullSize: (width, height) => {
            spawnPullWidth = width;
            spawnPullHeight = height;
        },
        getSelectedPropId: () => selectedPropId,
        setSelectedPropId: (id) => {
            selectedPropId = id;
            selectedPadId = null;
            sync();
        },
        getSelectedPadId: () => selectedPadId,
        setSelectedPadId: (id) => {
            selectedPadId = id;
            selectedPropId = null;
            sync();
        },
        getSelectedPad: () => {
            if (selectedPadId == null) return null;
            const pad = host.getSimState().entityRegistry.get(selectedPadId);
            if (!pad || getSandboxEntityMeta(host.getSimState()).getAssemblyGroupId(pad.id)) {
                selectedPadId = null;
                return null;
            }
            return getSandboxPadEditorState(pad);
        },
        patchSelectedPad: (patch) => {
            if (selectedPadId == null) return false;
            const ok = patchSandboxPad(host.getSimState(), selectedPadId, patch);
            if (ok) sync();
            return ok;
        },
        getSelectedProp: () => {
            pruneSelection();
            return selectedPropId == null ? null : registry().getLive(selectedPropId);
        },
        pruneSelection,
        spawnAt,
        spawnAtCameraOrigin() {
            const origin = host.getCameraOrigin();
            if (isSandboxSpawnPadId(spawnPropId)) {
                const preset = parseSandboxPadPreset(spawnPropId);
                /** @type {{ halfWidth?: number, halfHeight?: number }} */
                const options = {};
                if (preset === "pull") {
                    options.halfWidth = spawnPullWidth / 2;
                    options.halfHeight = spawnPullHeight / 2;
                }
                const pad = spawnSandboxPad(host, preset, origin.x, origin.y, options);
                selectedPadId = pad.id;
                selectedPropId = null;
                sync();
                return null;
            }
            if (spawnPropId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX)) return this.spawnAssemblyAt(origin.x, origin.y, spawnPropId.slice(SANDBOX_SPAWN_ASSEMBLY_PREFIX.length));
            return spawnAt(origin.x, origin.y);
        },
        spawnAssemblyAt(centerX, centerY, assemblyId) {
            const instance = spawnAssembly(host, centerX, centerY, assemblyId, { faction: spawnFaction });
            selectedPropId = instance.defaultPropId;
            sync();
            return instance;
        },
        spawnAssemblyAtCameraOrigin(assemblyId) {
            const origin = host.getCameraOrigin();
            return this.spawnAssemblyAt(origin.x, origin.y, assemblyId);
        },
        listAssemblyManifests: () => listAssemblyManifests(),
        deleteAssemblyById(assemblyId) {
            const state = host.getSimState();
            const instance = state.sandbox.assemblyInstances.find((entry) => entry.id === assemblyId);
            if (!instance) return;
            deleteAssemblyInstance(state, assemblyId, getResolvedAssembly(instance.assemblyId).groupField);
            pruneSelection();
            sync();
        },
        listAssemblies() {
            const state = host.getSimState();
            return state.sandbox.assemblyInstances.map((entry) => ({ id: entry.id, label: getResolvedAssembly(entry.assemblyId).label, defaultPropId: entry.defaultPropId }));
        },
        deleteSandboxPadById(id) {
            deleteSandboxPad(host.getSimState(), id);
            if (selectedPadId === id) selectedPadId = null;
            sync();
        },
        listSandboxPads: () => listSandboxPads(host.getSimState()),
        deleteProp(prop) {
            if (!prop) return;
            host.removeProp(prop);
            if (selectedPropId === prop.id) {
                selectedPropId = null;
                registry().forEachOfKind("worldProp", (p) => {
                    if (selectedPropId == null && !p.isDead) selectedPropId = p.id;
                });
            }
            sync();
        },
        deletePropById(id) {
            this.deleteProp(registry().get(id));
        },
        listPlacedProps() {
            const counts = new Map();
            /** @type {{ id: number, type: string, faction: string, label: string }[]} */
            const placed = [];
            registry().forEachOfKind("worldProp", (prop) => {
                if (prop.isDead || getSandboxEntityMeta(host.getSimState()).hasAssemblyMembership(prop.id)) return;
                const typeLabel = (prop.type ?? "prop").replace(/_/g, " ");
                const index = (counts.get(prop.type) ?? 0) + 1;
                counts.set(prop.type, index);
                placed.push({ id: prop.id, type: prop.type, faction: resolveSandboxFaction(prop), label: `${typeLabel} #${index}` });
            });
            return placed;
        },
        clear() {
            host.clearProps();
            clearAssemblyInstances(host.getSimState());
            clearSandboxPads(host.getSimState());
            selectedPropId = null;
            selectedPadId = null;
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
    };
}
