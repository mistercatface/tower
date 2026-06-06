import { Events } from "./EventNames.js";
import { spawnFloatingText } from "./EventSystem.js";
import { persistentTriggers } from "./PersistentTriggers.js";
import { PersistentTriggerIds } from "./PersistentTriggerIds.js";
function registerTriggerDefinitions() {
    persistentTriggers.on(
        Events.COMBAT_ENEMY_KILLED,
        PersistentTriggerIds.FIRST_ENEMY_KILL,
        () => true,
        ({ enemy }) => {
            spawnFloatingText({ x: enemy?.x ?? 0, y: (enemy?.y ?? 0) - 48, text: "First blood.", color: "#FFEB3B" });
        },
    );
}
/**
 * Wire persistent triggers to the main event bus.
 * Per-run tutorials (e.g. intro guards → clue search) stay in GameListeners or radio oncePerRun.
 */
export function registerPersistentTriggers(eventBus) {
    registerTriggerDefinitions();
    eventBus.on(Events.COMBAT_ENEMY_KILLED, (payload) => {
        persistentTriggers.emit(Events.COMBAT_ENEMY_KILLED, payload);
    });
}
