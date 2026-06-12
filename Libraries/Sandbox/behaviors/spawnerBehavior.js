import { getPropAsset } from "../../Props/PropCatalog.js";
import { createDragLaunchInteraction } from "../dragLaunch.js";
import { fireSpawner, getSpawnerDragConfig, isSpawnerProp } from "../spawnerConfig.js";
export const SPAWNER_BEHAVIOR_ID = "spawner";
/** @param {object} prop @param {import("../dragLaunch.js").DragLaunchAim | null} aim */
function aimSpawnerFacing(prop, aim) {
    if (aim?.shotNx == null || aim.shotNy == null) return;
    prop.facing = Math.atan2(aim.shotNy, aim.shotNx);
    prop.angularVelocity = 0;
    prop.strategy.syncCollisionShape?.(prop);
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createSpawnerBehavior() {
    return {
        ...createDragLaunchInteraction({
            id: SPAWNER_BEHAVIOR_ID,
            getConfig: (prop) => getSpawnerDragConfig(prop, getPropAsset(prop.type)),
            onAim: aimSpawnerFacing,
            onLaunch(prop, shot, host) {
                fireSpawner(host.getWorldState(), prop, { nx: shot.nx, ny: shot.ny, power: shot.power });
            },
        }),
        supports(_prop, asset) {
            return isSpawnerProp(asset);
        },
    };
}
