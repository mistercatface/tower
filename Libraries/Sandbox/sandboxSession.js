import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * @param {SandboxHostPort} host
 * @param {{ defaultSpawnPropId: string }} options
 */
export function createSandboxSession(host, { defaultSpawnPropId }) {
    let spawnPropId = defaultSpawnPropId;
    /** @type {number | null} */
    let selectedPickupId = null;
    /** @type {(() => void) | null} */
    let uiSync = null;
    const sync = () => {
        host.requestRedraw();
        uiSync?.();
    };
    const spawnAt = (worldX, worldY) => {
        if (!getPropAsset(spawnPropId)) return null;
        const prop = new Pickup(worldX, worldY, spawnPropId, 0);
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
        getSelectedPickupId: () => selectedPickupId,
        setSelectedPickupId: (id) => {
            selectedPickupId = id;
            sync();
        },
        getSelectedPickup: () => host.getPickups().find((p) => p.id === selectedPickupId) ?? null,
        spawnAt,
        spawnAtCameraOrigin() {
            const origin = host.getCameraOrigin?.();
            if (!origin) return null;
            return spawnAt(origin.x, origin.y);
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
            return host.getPickups().map((pickup) => {
                const typeLabel = (pickup.type ?? "prop").replace(/_/g, " ");
                const index = (counts.get(pickup.type) ?? 0) + 1;
                counts.set(pickup.type, index);
                return { id: pickup.id, type: pickup.type, label: `${typeLabel} #${index}` };
            });
        },
        clear() {
            host.clearPickups();
            selectedPickupId = null;
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
    };
}
