import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { spawnAssembly, deleteAssemblyInstance, clearAssemblyInstances } from "./spawnAssembly.js";
import { getAssemblyManifest, listAssemblyManifests } from "./assemblies/assemblyRegistry.js";
import { clearSandboxPads, deleteSandboxPad, isSandboxSpawnPadId, listSandboxPads, parseSandboxPadPreset, spawnSandboxPad } from "./sandboxPads.js";
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
    /** @type {number | null} */
    let selectedPickupId = null;
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
        getSelectedPickupId: () => selectedPickupId,
        setSelectedPickupId: (id) => {
            selectedPickupId = id;
            sync();
        },
        getSelectedPickup: () => {
            pruneSelection();
            return host.getPickups().find((p) => p.id === selectedPickupId) ?? null;
        },
        pruneSelection,
        spawnAt,
        spawnAtCameraOrigin() {
            const origin = host.getCameraOrigin();
            const preset = parseSandboxPadPreset(spawnPropId);
            if (preset) {
                spawnSandboxPad(host, preset, origin.x, origin.y);
                sync();
                return null;
            }
            if (spawnPropId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX)) return this.spawnAssemblyAt(origin.x, origin.y, spawnPropId.slice(SANDBOX_SPAWN_ASSEMBLY_PREFIX.length));
            return spawnAt(origin.x, origin.y);
        },
        spawnAssemblyAt(centerX, centerY, assemblyId) {
            const instance = spawnAssembly(host, centerX, centerY, assemblyId, { faction: spawnFaction });
            if (!instance) return null;
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
            deleteAssemblyInstance(host.getWorldState(), assemblyId);
            pruneSelection();
            sync();
        },
        listAssemblies() {
            const state = host.getWorldState();
            return state.sandboxAssemblyInstances.map((entry, index) => ({
                id: entry.id,
                label: getAssemblyManifest(entry.assemblyId)?.label ?? entry.assemblyId ?? `table #${index + 1}`,
                defaultPickupId: entry.defaultPickupId,
            }));
        },
        deleteSandboxPadById(id) {
            deleteSandboxPad(host.getWorldState(), id);
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
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
    };
}
