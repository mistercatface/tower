import { Events, advanceRadioLine } from "../Core/EventSystem.js";
import { getSpeaker } from "../Radio/RadioDialogRegistry.js";

/** Player character — always shown in the left codec slot (MGS-style). */
const MAIN_CHARACTER_ID = "brock";

const elements = {
    overlay: null,
    portraitRow: null,
    speakerName: null,
    lineText: null,
    hint: null,
};

let keyListenerBound = false;
/** Last non-Brock speaker — stays on the right through Brock's reply (MGS codec). */
let lastRemoteSpeaker = null;

function bindElements() {
    elements.overlay = document.getElementById("radioDialog");
    elements.portraitRow = document.getElementById("radioPortraitRow");
    elements.speakerName = document.getElementById("radioSpeakerName");
    elements.lineText = document.getElementById("radioLineText");
    elements.hint = elements.overlay?.querySelector(".radio-dialog-hint") ?? null;
}

function findParticipant(participants, id) {
    return participants.find((p) => p.id === id) ?? null;
}

function resolveSpeaker(participants, speakerId) {
    const fromList = findParticipant(participants, speakerId);
    if (fromList) return fromList;
    const speaker = getSpeaker(speakerId);
    if (!speaker) return null;
    return { id: speakerId, ...speaker };
}

function getMainCharacter(participants) {
    return resolveSpeaker(participants, MAIN_CHARACTER_ID);
}

function createPortraitSlot(sideClass, participant, isActive, { empty = false } = {}) {
    const slot = document.createElement("div");
    slot.className =
        "radio-dialog-portrait-slot" + sideClass + (isActive ? " radio-dialog-portrait-active" : "");
    if (empty) {
        slot.classList.add("radio-dialog-portrait-empty");
    }

    const frame = document.createElement("div");
    frame.className = "radio-dialog-portrait-frame";
    slot.appendChild(frame);

    if (!empty && participant) {
        const img = document.createElement("img");
        img.className = "radio-dialog-portrait-img";
        img.src = participant.portrait;
        img.alt = participant.name;
        img.draggable = false;
        frame.appendChild(img);
    }

    const label = document.createElement("div");
    label.className = "radio-dialog-portrait-label";
    if (!empty && participant) {
        label.textContent = participant.name;
    }
    slot.appendChild(label);

    return slot;
}

export function showRadioDialog({ participants, line, lineIndex, lineCount }) {
    bindElements();
    if (!elements.overlay) return;

    elements.portraitRow.innerHTML = "";

    const mainCharacter = getMainCharacter(participants);
    const isMainSpeaking = line.speakerId === MAIN_CHARACTER_ID;

    if (!isMainSpeaking) {
        lastRemoteSpeaker = resolveSpeaker(participants, line.speakerId);
    }

    const remoteSpeaker = lastRemoteSpeaker;
    const isRemoteSpeaking = !isMainSpeaking && remoteSpeaker != null;

    if (mainCharacter) {
        elements.portraitRow.appendChild(
            createPortraitSlot(" radio-dialog-portrait-left", mainCharacter, isMainSpeaking),
        );
    }

    elements.portraitRow.appendChild(
        createPortraitSlot(" radio-dialog-portrait-right", remoteSpeaker, isRemoteSpeaking, {
            empty: !remoteSpeaker,
        }),
    );

    elements.speakerName.textContent = line.speakerName;
    elements.lineText.textContent = line.text;

    if (elements.hint) {
        elements.hint.textContent = lineIndex + 1 >= lineCount ? "Tap to close" : "Tap to continue";
    }

    elements.overlay.style.display = "flex";
}

export function hideRadioDialog() {
    bindElements();
    if (!elements.overlay) return;

    const advanceBtn = document.getElementById("radioDialogAdvanceBtn");
    if (advanceBtn && document.activeElement === advanceBtn) {
        advanceBtn.blur();
    }

    elements.overlay.style.display = "none";
    elements.portraitRow.innerHTML = "";
    lastRemoteSpeaker = null;
}

function onAdvanceInput(e) {
    if (elements.overlay?.style.display !== "flex") return;

    if (e.type === "keydown") {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
    }

    advanceRadioLine();
}

export function registerRadioUiListeners(eventBus) {
    bindElements();

    eventBus.on(Events.UI_SHOW_RADIO, (data) => showRadioDialog(data));
    eventBus.on(Events.UI_HIDE_RADIO, () => hideRadioDialog());

    const advanceBtn = document.getElementById("radioDialogAdvanceBtn");
    if (advanceBtn && !advanceBtn.dataset.bound) {
        advanceBtn.dataset.bound = "1";
        advanceBtn.addEventListener("click", onAdvanceInput);
    }

    if (!keyListenerBound) {
        keyListenerBound = true;
        document.addEventListener("keydown", onAdvanceInput);
    }
}
