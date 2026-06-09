import { FloatingText } from "./FloatingText.js";
export const FLOATING_TEXT_SPAWN_EVENT = "fx:floatingText";
export function createFloatingTextFeature({ zIndex = 100 } = {}) {
    return {
        initState(state) {
            state.entityLayers = state.entityLayers ?? [];
            state.floatingTexts = state.floatingTexts ?? [];
            if (!state.entityLayers.some((layer) => layer.key === "floatingTexts")) state.entityLayers.push({ key: "floatingTexts", zIndex });
        },
        simulationPhases: [
            {
                run(ctx, dt) {
                    FloatingText.updateAll(ctx.state, dt);
                },
            },
        ],
        registerListeners(eventBus) {
            eventBus.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
        },
        spawn(eventBus, payload) {
            eventBus.emit(FLOATING_TEXT_SPAWN_EVENT, payload);
        },
    };
}
