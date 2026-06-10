import { Pickup } from "../../Entities/Pickup.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { poolBallFromNumber } from "../Render/Props3D/poolBallArt.js";
import { buildPoolRackLayout } from "./poolRackLayout.js";
import { stampAssemblyGroupMember } from "./assemblies/assemblyLink.js";
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {number} cueX
 * @param {number} cueY
 * @param {{
 *   faction?: string,
 *   rackId?: string,
 *   groupId?: string,
 *   resolved: import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest,
 *   layout?: { cue: { x: number, y: number }, rack: { x: number, y: number, number: number }[] },
 * }} options
 */
export function spawnAssemblyRack(host, cueX, cueY, { faction, rackId, groupId, resolved, layout: layoutOverride }) {
    const cuePropId = resolved.props.cueBall;
    const ballPropId = resolved.props.objectBall;
    if (!getPropAsset(cuePropId) || !getPropAsset(ballPropId)) return null;
    const ballRadius = resolved.layout.ballRadius;
    const layout = layoutOverride ?? buildPoolRackLayout(cueX, cueY, ballRadius);
    const id = rackId ?? `pool-rack:${Date.now()}`;
    const groupField = resolved.groupField;
    const cueBehaviorOverrides = resolved.behaviors[cuePropId];
    const cue = new Pickup(layout.cue.x, layout.cue.y, cuePropId, 0);
    cue.faction = faction;
    cue.sandboxPoolRackId = id;
    if (groupId) stampAssemblyGroupMember(cue, groupId, resolved.id, groupField);
    if (cueBehaviorOverrides) cue.sandboxBehaviorOverrides = cueBehaviorOverrides;
    wakePushableBody(cue);
    host.addPickup(cue);
    for (let i = 0; i < layout.rack.length; i++) {
        const slot = layout.rack[i];
        const ball = new Pickup(slot.x, slot.y, ballPropId, 0);
        ball.faction = faction;
        ball.poolBall = poolBallFromNumber(slot.number);
        ball.sandboxPoolRackId = id;
        if (groupId) stampAssemblyGroupMember(ball, groupId, resolved.id, groupField);
        wakePushableBody(ball);
        host.addPickup(ball);
    }
    return { id, cueBallId: cue.id };
}
