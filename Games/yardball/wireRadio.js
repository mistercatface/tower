import { Events } from "../../Core/EventNames.js";
import {
    createRadioRegistry,
    createRadioController,
    createRadioDialogView,
    registerRadio,
} from "../../Libraries/Radio/index.js";

const yardballSpeakers = {
    coach: {
        id: "coach",
        name: "Coach",
        color: "#00FFCC",
        portrait: "Images/RadioPortraits/barry.png",
    },
};

const yardballConversations = {
    kickoff: {
        trigger: "kickoff",
        oncePerRun: true,
        lines: [
            { speakerId: "coach", text: "Welcome to Yard Ball. No guns. No zombies. Just physics." },
            { speakerId: "coach", text: "Tap anywhere to nudge the beach ball. Roll it into the neon ring inside the building." },
        ],
    },
    goal_complete: {
        trigger: "goal_complete",
        oncePerRun: true,
        lines: [
            { speakerId: "coach", text: "SUNK IT! The ball is home." },
            { speakerId: "coach", text: "That's a different game than shooting your way through a horde." },
        ],
    },
};

export const yardballRadioRegistry = createRadioRegistry({
    conversations: yardballConversations,
    speakers: yardballSpeakers,
});

/** @type {ReturnType<typeof createRadioController> | null} */
let yardballRadioController = null;

export function wireYardballRadio(eventBus, { requestPause, requestResume }) {
    const PAUSE_REASON = "radio";

    const view = createRadioDialogView({
        mainCharacterId: "coach",
        getSpeaker: (id) => yardballRadioRegistry.getSpeaker(id),
    });

    yardballRadioController = createRadioController({
        registry: yardballRadioRegistry,
        requestPause: () => requestPause(PAUSE_REASON),
        requestResume: () => requestResume(PAUSE_REASON),
        onShowLine: (payload) => eventBus.emit(Events.UI_SHOW_RADIO, payload),
        onHide: () => eventBus.emit(Events.UI_HIDE_RADIO),
    });

    registerRadio(eventBus, yardballRadioController, view, Events);
    return yardballRadioController;
}

export function isRadioDialogActive() {
    return yardballRadioController?.isActive() ?? false;
}
