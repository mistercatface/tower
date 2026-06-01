export const GamePhase = {
    MAP: "map",
    COMBAT: "combat",
    INSPECTOR: "inspector",
    REWARD: "reward",
};

const WORLD_SCENES = new Set([
    GamePhase.COMBAT,
    GamePhase.INSPECTOR,
    GamePhase.REWARD,
]);

export function isWorldScene(phase) {
    return WORLD_SCENES.has(phase);
}

export function isMapTraveling(state) {
    return state.mapTargetNodeId != null;
}

export function isMapTransition(state) {
    return isMapTraveling(state);
}

export function isCombatOrReward(phase) {
    return phase === GamePhase.COMBAT || phase === GamePhase.REWARD;
}

export function isCombat(phase) {
    return phase === GamePhase.COMBAT;
}

export function isInspector(phase) {
    return phase === GamePhase.INSPECTOR;
}

export function canRunWaveSpawning(state) {
    const currentNode = state.getCurrentMapNode();
    return state.phase !== GamePhase.MAP
        && state.phase !== GamePhase.REWARD
        && state.phase !== GamePhase.INSPECTOR
        && !state.isTransitioning
        && !isMapTraveling(state)
        && !state.startNodeIntroActive
        && !state.startNodeInspectionActive
        && !currentNode?.completed;
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
