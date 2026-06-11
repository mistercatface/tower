import { getPropAsset } from "../../Props/PropCatalog.js";
import { createDragLaunchInteraction } from "../dragLaunch.js";
import { fireSpawner, getSpawnerDragConfig, isSpawnerProp } from "../spawnerConfig.js";
export const SPAWNER_BEHAVIOR_ID = "spawner";
/** @param {object} pickup @param {import("../dragLaunch.js").DragLaunchAim | null} aim */
function aimSpawnerFacing(pickup, aim) {
    if (aim?.shotNx == null || aim.shotNy == null) return;
    pickup.facing = Math.atan2(aim.shotNy, aim.shotNx);
    pickup.angularVelocity = 0;
    pickup.strategy.syncCollisionShape?.(pickup);
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createSpawnerBehavior() {
    return {
        ...createDragLaunchInteraction({
            id: SPAWNER_BEHAVIOR_ID,
            getConfig: (pickup) => getSpawnerDragConfig(pickup, getPropAsset(pickup.type)),
            onAim: aimSpawnerFacing,
            onLaunch(pickup, shot, host) {
                fireSpawner(host.getWorldState(), pickup, { nx: shot.nx, ny: shot.ny, power: shot.power });
            },
        }),
        supports(_pickup, asset) {
            return isSpawnerProp(asset);
        },
    };
}
