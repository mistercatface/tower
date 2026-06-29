import { createObserverVisionFrame, getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
class FactionTargetRegistry {
    constructor() {
        this.claims = new Map(); // targetId -> { claimantId, distSq }
    }
    clear() {
        this.claims.clear();
    }
    registerClaim(targetId, claimantId, distSq) {
        const existing = this.claims.get(targetId);
        if (!existing || distSq < existing.distSq) this.claims.set(targetId, { claimantId, distSq });
    }
    isClaimedByCloser(targetId, seekerId, seekerDistSq) {
        const claim = this.claims.get(targetId);
        if (!claim) return false;
        return claim.claimantId !== seekerId && claim.distSq < seekerDistSq;
    }
}
function refreshObserverVisionFrame(state) {
    const snakeGame = state.sandbox.snakeGame;
    state.nav.observerVisionFrame = createObserverVisionFrame({
        tickId: snakeGame.simTick,
        navTopology: state.nav.topology,
        visionRange: snakeGame.config.shared.visionRange,
        viewport: state.viewport,
    });
}
export function requireSnakeVisionFrame(state) {
    ensureSnakePerceptionTick(state);
    return getObserverVisionFrame(state);
}
export function beginSnakePerceptionTick(state, tickId) {
    const snakeGame = state.sandbox.snakeGame;
    snakeGame.simTick = tickId;
    if (snakeGame.lastVisionBeginTick === tickId) return;
    snakeGame.lastVisionBeginTick = tickId;
    refreshObserverVisionFrame(state);
    if (snakeGame) {
        if (!snakeGame.factionTargetRegistry) snakeGame.factionTargetRegistry = new FactionTargetRegistry();
        snakeGame.factionTargetRegistry.clear();
        for (const [headId, instance] of snakeGame.instancesByHeadId) {
            if (instance.lifecycle !== "alive") continue;
            const targetId = instance.intent?.getTargetId();
            if (targetId != null) {
                const target = state.entityRegistry.getLive(targetId);
                if (target) {
                    const distSq = (instance.head.x - target.x) * (instance.head.x - target.x) + (instance.head.y - target.y) * (instance.head.y - target.y);
                    snakeGame.factionTargetRegistry.registerClaim(targetId, headId, distSq);
                }
            }
        }
    }
}
export function nextSnakePerceptionTickId(state) {
    const snakeGame = state.sandbox.snakeGame;
    snakeGame.simTick += 1;
    return snakeGame.simTick;
}
export function beginSnakePerceptionFrame(state) {
    const tickId = nextSnakePerceptionTickId(state);
    beginSnakePerceptionTick(state, tickId);
    state.nav.session?.beginFrame(tickId);
    return tickId;
}
export function endSnakePerceptionFrame(state) {
    state.nav.session?.flushFrame();
}
export function ensureSnakePerceptionTick(state) {
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame.simTick <= 0) beginSnakePerceptionFrame(state);
    else beginSnakePerceptionTick(state, snakeGame.simTick);
}
export function maybeBeginSnakeAutosimTick(state) {
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame._batchingPerception) return;
    beginSnakePerceptionFrame(state);
}
