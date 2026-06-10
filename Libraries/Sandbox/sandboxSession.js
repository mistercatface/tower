import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { createVoidZone, DEFAULT_VOID_RADIUS } from "../Spatial/zones/voidZone.js";
import { spawnAssembly, deleteAssemblyInstance, clearAssemblyInstances } from "./spawnAssembly.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
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
        if (!getPropAsset(spawnPropId)) return null;
        const prop = new Pickup(worldX, worldY, spawnPropId, 0);
        prop.faction = spawnFaction;
        host.addPickup(prop);
        selectedPickupId = prop.id;
        sync();
        return prop;
    };
    const voidZones = () => {
        const state = host.getWorldState?.();
        if (!state) return null;
        if (!state.sandboxVoidZones) state.sandboxVoidZones = [];
        return state.sandboxVoidZones;
    };
    const spawnVoidAt = (worldX, worldY, radius = DEFAULT_VOID_RADIUS) => {
        const zones = voidZones();
        if (!zones) return null;
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
            const origin = host.getCameraOrigin?.();
            if (!origin) return null;
            return spawnAt(origin.x, origin.y);
        },
        spawnVoidAt,
        spawnVoidAtCameraOrigin() {
            const origin = host.getCameraOrigin?.();
            if (!origin) return null;
            return spawnVoidAt(origin.x, origin.y);
        },
        spawnAssemblyAt(centerX, centerY) {
            const instance = spawnAssembly(host, centerX, centerY, "poolTable", { faction: spawnFaction });
            if (!instance) return null;
            selectedPickupId = instance.cueBallId;
            sync();
            return instance;
        },
        spawnAssemblyAtCameraOrigin() {
            const origin = host.getCameraOrigin?.();
            if (!origin) return null;
            return this.spawnAssemblyAt(origin.x, origin.y);
        },
        deleteAssemblyById(assemblyId) {
            const state = host.getWorldState?.();
            if (!state) return;
            deleteAssemblyInstance(state, assemblyId);
            pruneSelection();
            sync();
        },
        listAssemblies() {
            const state = host.getWorldState?.();
            if (!state?.sandboxAssemblyInstances?.length) return [];
            return state.sandboxAssemblyInstances.map((entry, index) => ({ id: entry.id, label: `assembly #${index + 1}`, cueBallId: entry.cueBallId }));
        },
        deleteVoidZoneById(id) {
            const zones = voidZones();
            if (!zones) return;
            const index = zones.findIndex((zone) => zone.id === id);
            if (index >= 0) zones.splice(index, 1);
            sync();
        },
        listVoidZones() {
            const zones = voidZones();
            if (!zones) return [];
            return zones.filter((zone) => !zone.sandboxGroupId).map((zone, index) => ({ id: zone.id, label: `void #${index + 1}`, radius: zone.shape.radius }));
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
            const state = host.getWorldState?.();
            if (state) clearAssemblyInstances(state);
            const zones = voidZones();
            if (zones) zones.length = 0;
            selectedPickupId = null;
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
    };
}
