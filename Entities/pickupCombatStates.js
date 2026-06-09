import { RagdollCorpse } from "./RagdollCorpse.js";
import { clearActorKinematics } from "../Libraries/Render/Characters/actorKinematicsRenderer.js";
import { canSplittablePickupSplit } from "../Libraries/Props/splittable.js";
export class PickupDeadState {
    onEnter(pickup) {
        pickup.isDead = true;
        const gameState = pickup.stateData.gameState;
        if (pickup.usesKinematicsBody && gameState) {
            const camera = pickup._kinematicsCamera ?? { x: pickup.x, y: pickup.y };
            RagdollCorpse.spawnFromActor(gameState, pickup, null, camera);
            clearActorKinematics(pickup);
        }
        if (canSplittablePickupSplit(pickup) && typeof pickup.spawnShards === "function") pickup.spawnShards(gameState);
    }
}
export const combatPickupStates = { dead: new PickupDeadState() };
