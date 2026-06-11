import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { spawnAssembly, deleteAssemblyInstance, clearAssemblyInstances } from "./spawnAssembly.js";
import { getResolvedAssembly, listAssemblyManifests } from "./assemblies/assemblyRegistry.js";
import {
    clearSandboxPads,
    deleteSandboxPad,
    getSandboxPad,
    getSandboxPadEditorState,
    isSandboxSpawnPadId,
    listSandboxPads,
    parseSandboxPadPreset,
    patchSandboxPad,
    spawnSandboxPad,
} from "./sandboxPads.js";
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
    let selectedPickupId = null;
    /** @type {string | null} */
    let selectedPadId = null;
    /** @type {(() => void) | null} */
    let uiSync = null;
    const sync = () => {
        host.requestRedraw();
        uiSync?.();
    };
    const pruneSelection = () => {
        if (selectedPickupId == null) return;
        if (!host.getPickups().some((p) => p.id === selectedPickupId && !p.isDead)) {
            selectedPickupId = null;
            uiSync?.();
        }
    };
    const spawnAt = (worldX, worldY) => {
        if (!isSandboxSpawnPropId(spawnPropId) || !getPropAsset(spawnPropId)) return null;
        const prop = new Pickup(worldX, worldY, spawnPropId, 0);
        prop.faction = spawnFaction;
        host.addPickup(prop);
        selectedPickupId = prop.id;
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
        getSelectedPickupId: () => selectedPickupId,
        setSelectedPickupId: (id) => {
            selectedPickupId = id;
            selectedPadId = null;
            sync();
        },
        getSelectedPadId: () => selectedPadId,
        setSelectedPadId: (id) => {
            selectedPadId = id;
            selectedPickupId = null;
            sync();
        },
        getSelectedPad: () => {
            if (selectedPadId == null) return null;
            const pad = getSandboxPad(host.getWorldState(), selectedPadId);
            if (!pad || pad.sandboxGroupId) {
                selectedPadId = null;
                return null;
            }
            return getSandboxPadEditorState(pad);
        },
        patchSelectedPad: (patch) => {
            if (selectedPadId == null) return false;
            const ok = patchSandboxPad(host.getWorldState(), selectedPadId, patch);
            if (ok) sync();
            return ok;
        },
        getSelectedPickup: () => {
            pruneSelection();
            return host.getPickups().find((p) => p.id === selectedPickupId) ?? null;
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
                selectedPickupId = null;
                sync();
                return null;
            }
            if (spawnPropId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX)) return this.spawnAssemblyAt(origin.x, origin.y, spawnPropId.slice(SANDBOX_SPAWN_ASSEMBLY_PREFIX.length));
            return spawnAt(origin.x, origin.y);
        },
        spawnAssemblyAt(centerX, centerY, assemblyId) {
            const instance = spawnAssembly(host, centerX, centerY, assemblyId, { faction: spawnFaction });
            selectedPickupId = instance.defaultPickupId;
            sync();
            return instance;
        },
        spawnAssemblyAtCameraOrigin(assemblyId) {
            const origin = host.getCameraOrigin();
            return this.spawnAssemblyAt(origin.x, origin.y, assemblyId);
        },
        listAssemblyManifests: () => listAssemblyManifests(),
        deleteAssemblyById(assemblyId) {
            const state = host.getWorldState();
            const instance = state.sandboxAssemblyInstances.find((entry) => entry.id === assemblyId);
            if (!instance) return;
            deleteAssemblyInstance(state, assemblyId, getResolvedAssembly(instance.assemblyId).groupField);
            pruneSelection();
            sync();
        },
        listAssemblies() {
            const state = host.getWorldState();
            return state.sandboxAssemblyInstances.map((entry) => ({ id: entry.id, label: getResolvedAssembly(entry.assemblyId).label, defaultPickupId: entry.defaultPickupId }));
        },
        deleteSandboxPadById(id) {
            deleteSandboxPad(host.getWorldState(), id);
            if (selectedPadId === id) selectedPadId = null;
            sync();
        },
        listSandboxPads: () => listSandboxPads(host.getWorldState()),
        deletePickup(pickup) {
            if (!pickup) return;
            host.removePickup(pickup);
            if (selectedPickupId === pickup.id) selectedPickupId = host.getPickups()[0]?.id ?? null;
            sync();
        },
        deletePickupById(id) {
            const pickup = host.getPickups().find((p) => p.id === id);
            this.deletePickup(pickup);
        },
        listPlacedPickups() {
            const counts = new Map();
            return host
                .getPickups()
                .filter((pickup) => !pickup.sandboxGroupId && !pickup.assemblyRackId)
                .map((pickup) => {
                    const typeLabel = (pickup.type ?? "prop").replace(/_/g, " ");
                    const index = (counts.get(pickup.type) ?? 0) + 1;
                    counts.set(pickup.type, index);
                    return { id: pickup.id, type: pickup.type, faction: resolveSandboxFaction(pickup), label: `${typeLabel} #${index}` };
                });
        },
        clear() {
            host.clearPickups();
            clearAssemblyInstances(host.getWorldState());
            clearSandboxPads(host.getWorldState());
            selectedPickupId = null;
            selectedPadId = null;
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
    };
}
