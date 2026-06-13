import { SandboxEntityMetaStore } from "../Libraries/Sandbox/sandboxEntityMeta.js";
/** Sandbox playfield data — per-entity editor metadata. */
export class SandboxWorldState {
    constructor() {
        this.entityMeta = new SandboxEntityMetaStore();
        /** @type {ReturnType<typeof import("../Libraries/Sandbox/createSandboxController.js").createSandboxController> | null} */
        this.controller = null;
    }
}
