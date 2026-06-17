import { SandboxEntityMetaStore } from "./sandboxEntityMeta.js";
/** Sandbox playfield data — per-entity editor metadata. */
export class SandboxWorldState {
    constructor() {
        this.entityMeta = new SandboxEntityMetaStore();
        /** @type {object[]} worker-baked animated surface zones — see Libraries/WorldSurface/animatedSurfaceZone.js */
        this.animatedSurfaceZones = [];
        /** @type {ReturnType<typeof import("../Libraries/SandboxEditor/createSandboxController.js").createSandboxController> | null} */
        this.controller = null;
        /** @type {import("../Libraries/Sandbox/gridZoneTick.js").GridZoneSubscriptions | null} */
        this.gridZoneSubscriptions = null;
        this.gridZoneSubscriptionsDirty = true;
        /** @type {Set<number>} canonical edge keys with a prop on the beam while powered */
        this.tripwireTriggeredKeys = new Set();
        /** @type {object[]} recent belt cell zone events for future train-style consumers */
        this.beltZoneEvents = [];
    }
}
