import { applySandboxSceneSnapshot } from "./sandboxSceneSnapshot.js";
import { buildSandboxRoomGraphSceneDoc } from "./sandboxRoomGraphGen.js";
/** Procedural room graph — new layout each call unless you pass a seed. */
export function buildSandboxGraphSceneDoc(options = {}) {
    return buildSandboxRoomGraphSceneDoc(options);
}
/** Replace the current sandbox with a freshly generated room graph. */
export function spawnSandboxGraphScene(state, options = {}) {
    applySandboxSceneSnapshot(state, buildSandboxRoomGraphSceneDoc(options));
}
