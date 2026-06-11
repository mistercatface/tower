import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { createVoidZone, DEFAULT_VOID_RADIUS } from "../Spatial/zones/voidZone.js";
import { spawnAssembly, deleteAssemblyInstance, clearAssemblyInstances } from "./spawnAssembly.js";
import { getAssemblyManifest, listAssemblyManifests } from "./assemblies/assemblyRegistry.js";
import {
    SANDBOX_SPAWN_PRESSURE_PLATE,
    clearPressurePlates,
    deletePressurePlate,
    listPressurePlates,
    spawnPressurePlate,
} from "./pressurePlate.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
export { SANDBOX_SPAWN_PRESSURE_PLATE } from "./pressurePlate.js";
export const SANDBOX_SPAWN_VOID = "void";
export const SANDBOX_SPAWN_ASSEMBLY_PREFIX = "assembly:";
/** @param {string} assemblyId */
export function sandboxSpawnAssemblyId(assemblyId) {
    return `${SANDBOX_SPAWN_ASSEMBLY_PREFIX}${assemblyId}`;
}
/** @param {string} spawnId */
export function isSandboxSpawnPropId(spawnId) {
    return spawnId !== SANDBOX_SPAWN_VOID && spawnId !== SANDBOX_SPAWN_PRESSURE_PLATE && !spawnId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX);
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
    const voidZones = () => host.getWorldState().sandboxVoidZones;
    const spawnVoidAt = (worldX, worldY, radius = DEFAULT_VOID_RADIUS) => {
        const zones = voidZones();
        const zone = createVoidZone(worldX, worldY, radius, { id: `void:${zones.length + 1}` });
        zones.push(zone);
        sync();
        return zone;
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
            if (spawnPropId === SANDBOX_SPAWN_VOID) return spawnVoidAt(origin.x, origin.y);
            if (spawnPropId === SANDBOX_SPAWN_PRESSURE_PLATE) {
                spawnPressurePlate(host, origin.x, origin.y);
                sync();
                return null;
            }
            if (spawnPropId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX)) return this.spawnAssemblyAt(origin.x, origin.y, spawnPropId.slice(SANDBOX_SPAWN_ASSEMBLY_PREFIX.length));
            return spawnAt(origin.x, origin.y);
        },
        spawnVoidAt,
        spawnVoidAtCameraOrigin() {
            const origin = host.getCameraOrigin();
            return spawnVoidAt(origin.x, origin.y);
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
        deleteVoidZoneById(id) {
            const zones = voidZones();
            const index = zones.findIndex((zone) => zone.id === id);
            if (index >= 0) zones.splice(index, 1);
            sync();
        },
        deletePressurePlateById(id) {
            deletePressurePlate(host.getWorldState(), id);
            sync();
        },
        listPressurePlates: () => listPressurePlates(host.getWorldState()),
        listVoidZones() {
            return voidZones()
                .filter((zone) => !zone.sandboxGroupId)
                .map((zone, index) => ({ id: zone.id, label: `void #${index + 1}`, radius: zone.shape.radius }));
        },
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
            clearPressurePlates(host.getWorldState());
            voidZones().length = 0;
            selectedPickupId = null;
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
    };
}
