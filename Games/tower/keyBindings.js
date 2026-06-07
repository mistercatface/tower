import { COMBAT_HUD_MODE_COUNT, COMBAT_HUD_MODE_LABELS } from "../../Config/Config.js";
import { emitMapToggle } from "../../Core/EventSystem.js";
/** @param {import("../../Libraries/FSM/StateMachine.js").StateMachine} fsm */
export function towerKeyBindings(fsm) {
    return [
        {
            key: "d",
            onPress: () => {
                fsm.context.state.debugMode = !fsm.context.state.debugMode;
                console.log("Debug Mode: " + fsm.context.state.debugMode);
            },
        },
        { key: "m", onPress: () => emitMapToggle() },
        {
            key: "h",
            onPress: () => {
                const state = fsm.context.state;
                state.combatHudMode = (state.combatHudMode + 1) % COMBAT_HUD_MODE_COUNT;
                console.log("Combat HUD Mode: " + COMBAT_HUD_MODE_LABELS[state.combatHudMode]);
            },
        },
    ];
}
