import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
import { addChainLink } from "../../../Sandbox/chainLinks.js";
import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { resolveSandboxFaction } from "../../../Sandbox/sandboxFaction.js";
import { applyFleeHornWedgeScale, fleeHornMountOffsetFromBallCenter } from "../../../Props/fleeHornWedge.js";
import { getCirclePropRadius } from "../../../Props/propScale.js";
import { getSnakeGameConfig, applyHornSatelliteGameplay } from "../snakeGameConfig.js";
export const HORN_SATELLITE_EXPORT_TYPE = "horn_satellite";
export function spawnFleeHornSatelliteForBall(state, ball, { spawnGroupId, bodyRadius, forwardDir, faction }) {
    const config = getSnakeGameConfig();
    const hornConfig = config.hornSatellite;
    const radius = bodyRadius ?? getCirclePropRadius(ball);
    const forward = forwardDir ?? { x: Math.cos(ball.facing ?? 0), y: Math.sin(ball.facing ?? 0) };
    const wedgeScale = hornConfig.wedgeScale ?? 1;
    const mountOffset = fleeHornMountOffsetFromBallCenter(radius, wedgeScale);
    const hornPropId = hornConfig.hornPropId;
    const horn = spawnPlacedSandboxProp(state, ball.x + forward.x * mountOffset, ball.y + forward.y * mountOffset, hornPropId, faction);
    applyFleeHornWedgeScale(horn, radius, wedgeScale);
    applyHornSatelliteGameplay(horn);
    horn.facing = Math.atan2(forward.y, forward.x);
    const meta = getSandboxEntityMeta(state);
    meta.setSpawnGroupId(horn.id, spawnGroupId);
    meta.setSpawnGroupExportType(horn.id, HORN_SATELLITE_EXPORT_TYPE);
    addChainLink(state, ball.id, horn.id, hornConfig.linkSlack);
    return { horn };
}
