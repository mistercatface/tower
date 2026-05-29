export const GamePhase = {
    MAP: "map",
    MAP_TRANSITION: "map_transition",
    COMBAT: "combat",
    REWARD: "reward",
};

const WORLD_SCENES = new Set([
    GamePhase.COMBAT,
    GamePhase.REWARD,
    GamePhase.MAP_TRANSITION,
]);

export function isWorldScene(phase) {
    return WORLD_SCENES.has(phase);
}

export function isMapTransition(phase) {
    return phase === GamePhase.MAP_TRANSITION;
}

export function isCombatOrReward(phase) {
    return phase === GamePhase.COMBAT || phase === GamePhase.REWARD;
}

export function isCombat(phase) {
    return phase === GamePhase.COMBAT;
}

export function canRunWaveSpawning(state) {
    return state.phase !== GamePhase.MAP
        && state.phase !== GamePhase.REWARD
        && !state.isTransitioning;
}

/** Range and center for drawing combat rings / masks in world vs map space. */
export function getWorldDrawCoords(state, viewport, fallbackRange) {
    if (viewport && isWorldScene(state.phase)) {
        return {
            useViewport: true,
            range: viewport.getVisualRadius() / viewport.zoom,
            x: viewport.x,
            y: viewport.y,
        };
    }
    const range = fallbackRange ?? state.player.weapon.range;
    return {
        useViewport: false,
        range,
        x: state.player.x,
        y: state.player.y,
    };
}
