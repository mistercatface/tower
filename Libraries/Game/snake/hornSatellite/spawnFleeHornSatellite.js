import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
import { addChainLink } from "../../../Sandbox/chainLinks.js";
import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { applyFleeHornWedgeScale, fleeHornChainRestLength, fleeHornMountOffsetFromBallCenter } from "../../../Props/fleeHornWedge.js";
import { getCirclePropRadius } from "../../../Props/propScale.js";
import { getSnakeGameConfig, applyHornSatelliteGameplay } from "../snakeGameConfig.js";

export const HORN_SATELLITE_EXPORT_TYPE = "horn_satellite";

export function spawnFleeHornSatelliteForBall(state, ball, { spawnGroupId, bodyRadius, forwardDir, faction }) {
    const config = getSnakeGameConfig();
    const hornConfig = config.hornSatellite;
    const radius = bodyRadius ?? getCirclePropRadius(ball);
    const forward = forwardDir ?? { x: Math.cos(ball.facing ?? 0), y: Math.sin(ball.facing ?? 0) };
    const wedgeScale = hornConfig.wedgeScale ?? 1;
    const spacing = fleeHornMountOffsetFromBallCenter(radius, wedgeScale);
    const horn = spawnPlacedSandboxProp(
        state,
        ball.x + forward.x * spacing,
        ball.y + forward.y * spacing,
        hornConfig.hornPropId,
        faction,
    );
    applyFleeHornWedgeScale(horn, radius, wedgeScale);
    applyHornSatelliteGameplay(horn);
    horn.facing = Math.atan2(forward.y, forward.x);
    const meta = getSandboxEntityMeta(state);
    meta.setSpawnGroupId(horn.id, spawnGroupId);
    meta.setSpawnGroupExportType(horn.id, HORN_SATELLITE_EXPORT_TYPE);
    addChainLink(
        state,
        ball.id,
        horn.id,
        hornConfig.linkSlack,
        fleeHornChainRestLength(radius, wedgeScale, hornConfig.linkSlack),
    );
    return { horn };
}
