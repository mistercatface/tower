import { Pickup } from "../../../Entities/Pickup.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { resolveSandboxFaction } from "../../Combat/sandboxTargeting.js";
import { applyDragLaunchVelocity, createDragLaunchInteraction } from "../dragLaunch.js";
import { getSpawnerDragConfig, getSpawnerOutletWorld, isSpawnerProp, resolveSpawnerPropId } from "../spawnerConfig.js";
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
                const asset = getPropAsset(pickup.type);
                const spawnId = resolveSpawnerPropId(pickup, asset);
                if (!getPropAsset(spawnId)) return;
                const outlet = getSpawnerOutletWorld(pickup, asset);
                const spawned = new Pickup(outlet.x, outlet.y, spawnId, Math.atan2(outlet.ny, outlet.nx));
                spawned.faction = resolveSandboxFaction(pickup);
                applyDragLaunchVelocity(spawned, shot.nx, shot.ny, shot.power);
                host.addPickup(spawned);
            },
        }),
        supports(_pickup, asset) {
            return isSpawnerProp(asset);
        },
    };
}
