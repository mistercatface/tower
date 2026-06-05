import { getActiveGameDefinition } from "../Core/ActiveGameDefinition.js";

export const GamePhase = {
    MAP: "map",
    COMBAT: "combat",
    INSPECTOR: "inspector",
};

const WORLD_SCENES = new Set([
    GamePhase.COMBAT,
    GamePhase.INSPECTOR,
]);

export function isWorldScene(phase) {
    return WORLD_SCENES.has(phase);
}

export function isCombat(phase) {
    return phase === GamePhase.COMBAT;
}

export function isInspector(phase) {
    return phase === GamePhase.INSPECTOR;
}

export function canRunHordeSpawning(state) {
    if (state.phase === GamePhase.MAP || state.phase === GamePhase.INSPECTOR) return false;
    const gameCheck = getActiveGameDefinition()?.canRunHordeSpawning;
    return gameCheck ? gameCheck(state) : true;
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
