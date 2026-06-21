import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { getSnakeGameConfig, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { buildSnakeMemberToInstanceMap } from "./SnakeInstance.js";
import { splitSnakeAtStruckSegment } from "./snakeCombat.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { DRAG_LAUNCH_WAIT_BEHAVIOR_ID } from "../../Sandbox/dragLaunch.js";
import { setCirclePropRadius } from "../../Props/propScale.js";
import { stampPropVisualOverride } from "../../Color/visualOverride.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { snakeDeathImpactFromContact } from "./snakeCombat.js";
const STRIKER_BEHAVIOR_OVERRIDES = { inputGates: { [DRAG_LAUNCH_WAIT_BEHAVIOR_ID]: [{ scope: "self", until: "atRest" }] } };
export function spawnSnakeStriker(state, anchorProp) {
    const config = getSnakeGameConfig();
    const startRadius = resolveSnakeStartRadius(config);
    const offset = startRadius * 4;
    const x = anchorProp.x - config.growDirX * offset;
    const y = anchorProp.y - config.growDirY * offset;
    const prop = spawnPlacedSandboxProp(state, x, y, config.strikerPropId, SANDBOX_DEFAULT_FACTION);
    setCirclePropRadius(prop, startRadius);
    const asset = getPropAsset(config.strikerPropId);
    if (asset?.defaultVisualOverride) stampPropVisualOverride(prop, asset.defaultVisualOverride);
    getSandboxEntityMeta(state).setBehaviorOverrides(prop.id, STRIKER_BEHAVIOR_OVERRIDES);
    return prop;
}
function orderedMembers(state, headId) {
    return getConnectedComponentPath(state.kinetic, headId);
}
function resolveStrikerVictim(state, snakeGame, snakeBodyId) {
    const instance = buildSnakeMemberToInstanceMap(state, snakeGame).get(snakeBodyId);
    if (!instance) return null;
    return { victimHeadId: instance.headId, members: orderedMembers(state, instance.headId) };
}
export function resolveStrikerBallSnakeSplitsFromContacts(state, spatialFrame, contacts, snakeGame, strikerBall) {
    if (!strikerBall || contacts.count === 0) return;
    const config = getSnakeGameConfig();
    const strikerId = strikerBall.id;
    const splitLinks = new Set();
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        let snakeBody = null;
        if (pair.bodyA.id === strikerId) snakeBody = pair.bodyB;
        else if (pair.bodyB.id === strikerId) snakeBody = pair.bodyA;
        else continue;
        const victim = resolveStrikerVictim(state, snakeGame, snakeBody.id);
        if (!victim) continue;
        const strikerPreSpeed = pair.bodyA.id === strikerId ? contacts.dynamic.preSpeedA[i] : contacts.dynamic.preSpeedB[i];
        if (strikerPreSpeed < config.kineticMinStrikeSpeed) continue;
        const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
        if (relSpeed < config.splitImpulseThreshold) continue;
        const strikeIndex = victim.members.indexOf(snakeBody.id);
        if (strikeIndex < 0 || strikeIndex >= victim.members.length - 1) continue;
        const linkKey = `${victim.members[strikeIndex]}:${victim.members[strikeIndex + 1]}`;
        if (splitLinks.has(linkKey)) continue;
        splitLinks.add(linkKey);
        const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, snakeBody.id, snakeBody, relSpeed);
        splitSnakeAtStruckSegment(state, snakeGame, victim.victimHeadId, snakeBody.id, victim.members, deathImpact);
    }
}
