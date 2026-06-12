import { SandboxEntityMetaStore } from "../Libraries/Sandbox/sandboxEntityMeta.js";
/** Sandbox playfield data — pads, assemblies, and per-entity editor metadata. */
export class SandboxWorldState {
    constructor() {
        this.pads = [];
        this.assemblyInstances = [];
        this.assemblyGuides = [];
        this.surfaceProfileZones = [];
        this.entityMeta = new SandboxEntityMetaStore();
    }
}
