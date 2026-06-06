import { Events } from "../../Core/EventNames.js";
import {
    createRadioRegistry,
    createRadioController,
    createRadioDialogView,
    registerRadio,
} from "../../Libraries/Radio/index.js";

const poolSpeakers = {
    coach: {
        id: "coach",
        name: "Coach",
        portrait: "Images/RadioPortraits/barry.png",
    },
};

const poolConversations = {
    break_shot: {
        trigger: "break_shot",
        oncePerRun: true,
        lines: [
            { speakerId: "coach", text: "Pull back opposite where you want to shoot — the white line shows the ball path, not your finger." },
            { speakerId: "coach", text: "Sink both object balls. Scratch and the cue respots — no foul drama yet." },
        ],
    },
    table_clear: {
        trigger: "table_clear",
        oncePerRun: true,
        lines: [
            { speakerId: "coach", text: "Table clear! That's pool — not yard ball." },
        ],
    },
};

export const poolRadioRegistry = createRadioRegistry({
    conversations: poolConversations,
    speakers: poolSpeakers,
});

/** @type {ReturnType<typeof createRadioController> | null} */
let poolRadioController = null;

export function wirePoolRadio(eventBus, { requestPause, requestResume }) {
    const PAUSE_REASON = "radio";

    const view = createRadioDialogView({
        mainCharacterId: "coach",
        getSpeaker: (id) => poolRadioRegistry.getSpeaker(id),
    });

    poolRadioController = createRadioController({
        registry: poolRadioRegistry,
        requestPause: () => requestPause(PAUSE_REASON),
        requestResume: () => requestResume(PAUSE_REASON),
        onShowLine: (payload) => eventBus.emit(Events.UI_SHOW_RADIO, payload),
        onHide: () => eventBus.emit(Events.UI_HIDE_RADIO),
    });

    registerRadio(eventBus, poolRadioController, view, Events);
    return poolRadioController;
}

export function isRadioDialogActive() {
    return poolRadioController?.isActive() ?? false;
}
