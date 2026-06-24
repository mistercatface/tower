import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
export function tickAgentIntent(state, intent, agent, dtMs, tickFsmLogic) {
    const snakeGame = state.sandbox.snakeGame;
    const soloTick = !snakeGame._batchingPerception;
    if (snakeGame._batchingPerception) ensureSnakePerceptionTick(state);
    else maybeBeginSnakeAutosimTick(state);
    tickFsmLogic(agent);
    if (intent.headNav) intent.headNav.tick(agent, dtMs);
    if (soloTick) endSnakePerceptionFrame(state);
}
export function reapAgentInstance(state, snakeGame, instance, deathImpact = null) {
    const meta = snakeGame.registry.aliveByHeadId.get(instance.headId);
    const def = meta ? snakeGame.speciesById.get(meta.species) : null;
    if (def && typeof def.die === "function") def.die(instance, state, snakeGame, deathImpact);
    else throw new Error(`Missing die hook for species ${meta?.species}`);
}
