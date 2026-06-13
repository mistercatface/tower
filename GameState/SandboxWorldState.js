import { SandboxEntityMetaStore } from "../Libraries/Sandbox/sandboxEntityMeta.js";
/** Sandbox playfield data — per-entity editor metadata. */
export class SandboxWorldState {
    constructor() {
        this.entityMeta = new SandboxEntityMetaStore();
        /** @type {object[]} worker-baked animated surface zones — see Libraries/WorldSurface/animatedSurfaceZone.js */
        this.animatedSurfaceZones = [];
        /** @type {ReturnType<typeof import("../Libraries/Sandbox/createSandboxController.js").createSandboxController> | null} */
        this.controller = null;
    }
}
