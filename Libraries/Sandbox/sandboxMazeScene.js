import { applySandboxSceneSnapshot } from "./sandboxSceneSnapshot.js";
import { buildSandboxBeltNetworkSceneDoc } from "./sandboxBeltNetworkGen.js";
/** Procedural belt-network scene — new layout each call unless you pass a seed. */
export function buildSandboxMazeSceneDoc(options = {}) {
    return buildSandboxBeltNetworkSceneDoc(options);
}
/** Replace the current sandbox with a freshly generated belt network. */
export function spawnSandboxMazeScene(state, options = {}) {
    applySandboxSceneSnapshot(state, buildSandboxBeltNetworkSceneDoc(options));
}
