import { RagdollCorpse } from "./RagdollCorpse.js";
import { clearActorKinematics } from "../Libraries/Render/Characters/actorKinematicsRenderer.js";
import { canSplittableWorldPropSplit } from "../Libraries/Props/splittable.js";
export class WorldPropDeadState {
    onEnter(prop) {
        prop.isDead = true;
        const gameState = prop.stateData.gameState;
        if (prop.usesKinematicsBody && gameState) {
            const camera = prop._kinematicsCamera ?? { x: prop.x, y: prop.y };
            RagdollCorpse.spawnFromActor(gameState, prop, null, camera);
            clearActorKinematics(prop);
        }
        if (canSplittableWorldPropSplit(prop) && typeof prop.spawnShards === "function") prop.spawnShards(gameState);
    }
}
