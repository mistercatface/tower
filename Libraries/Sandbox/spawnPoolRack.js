import { Pickup } from "../../Entities/Pickup.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { poolBallFromNumber } from "../Render/Props3D/poolBallArt.js";
import { buildPoolRackLayout } from "./poolRackLayout.js";
/** @param {import("./SandboxHostPort.js").SandboxHostPort} host @param {number} cueX @param {number} cueY @param {{ faction?: string, rackId?: string }} [options] */
export function spawnPoolRack(host, cueX, cueY, { faction, rackId } = {}) {
    if (!getPropAsset("pool_ball") || !getPropAsset("pool_cue_ball")) return null;
    const ballRadius = getPropAsset("pool_ball").physics?.radius ?? 8;
    const layout = buildPoolRackLayout(cueX, cueY, ballRadius);
    const id = rackId ?? `pool-rack:${Date.now()}`;
    const cue = new Pickup(layout.cue.x, layout.cue.y, "pool_cue_ball", 0);
    cue.faction = faction;
    cue.sandboxPoolRackId = id;
    wakePushableBody(cue);
    host.addPickup(cue);
    for (let i = 0; i < layout.rack.length; i++) {
        const slot = layout.rack[i];
        const ball = new Pickup(slot.x, slot.y, "pool_ball", 0);
        ball.faction = faction;
        ball.poolBall = poolBallFromNumber(slot.number);
        ball.sandboxPoolRackId = id;
        wakePushableBody(ball);
        host.addPickup(ball);
    }
    return { id, cueBallId: cue.id };
}
