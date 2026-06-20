import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { DRAG_LAUNCH_WAIT_BEHAVIOR_ID } from "../../Sandbox/dragLaunch.js";
import { setCirclePropRadius } from "../../Props/propScale.js";
import { stampPropVisualOverride } from "../../Color/visualOverride.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { getSnakeGameConfig, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { resolveAliveSnakeHeadId } from "./snakeLifecycle.js";
import { splitSnakeAtStruckSegment } from "./snakeCombat.js";
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
export function resolveStrikerBallSnakeSplitsFromContacts(state, spatialFrame, contacts, snakeGame, strikerBall) {
    if (!strikerBall || contacts.count === 0) return;
    const config = getSnakeGameConfig();
    const registry = snakeGame.registry;
    const strikerId = strikerBall.id;
    const splitLinks = new Set();
    const resolveHead = (propId) => resolveAliveSnakeHeadId(registry, (headId) => orderedMembers(state, headId), propId);
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        let snakeBody = null;
        if (pair.bodyA.id === strikerId) snakeBody = pair.bodyB;
        else if (pair.bodyB.id === strikerId) snakeBody = pair.bodyA;
        else continue;
        const victimHeadId = resolveHead(snakeBody.id);
        if (victimHeadId == null) continue;
        const strikerPreSpeed = pair.bodyA.id === strikerId ? contacts.preSpeedA[i] : contacts.preSpeedB[i];
        if (strikerPreSpeed < config.strikerMinStrikeSpeed) continue;
        const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        if (relSpeed < config.splitImpulseThreshold) continue;
        const members = orderedMembers(state, victimHeadId);
        const strikeIndex = members.indexOf(snakeBody.id);
        if (strikeIndex < 0 || strikeIndex >= members.length - 1) continue;
        const linkKey = `${members[strikeIndex]}:${members[strikeIndex + 1]}`;
        if (splitLinks.has(linkKey)) continue;
        splitLinks.add(linkKey);
        splitSnakeAtStruckSegment(state, snakeGame, victimHeadId, snakeBody.id);
    }
}
