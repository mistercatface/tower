import { Events, advanceRadioLine } from "../Core/EventSystem.js";

const elements = {
    overlay: null,
    portraitRow: null,
    speakerName: null,
    lineText: null,
    hint: null,
};

let keyListenerBound = false;

function bindElements() {
    elements.overlay = document.getElementById("radioDialog");
    elements.portraitRow = document.getElementById("radioPortraitRow");
    elements.speakerName = document.getElementById("radioSpeakerName");
    elements.lineText = document.getElementById("radioLineText");
    elements.hint = elements.overlay?.querySelector(".radio-dialog-hint") ?? null;
}

function getPortraitSideClass(index, count) {
    if (count <= 1) return " radio-dialog-portrait-left";
    if (count === 2) {
        return index === 0 ? " radio-dialog-portrait-left" : " radio-dialog-portrait-right";
    }
    if (index === 0) return " radio-dialog-portrait-left";
    if (index === count - 1) return " radio-dialog-portrait-right";
    return " radio-dialog-portrait-center";
}

function createPortraitSlot(participant, isActive, sideClass) {
    const slot = document.createElement("div");
    slot.className =
        "radio-dialog-portrait-slot" + sideClass + (isActive ? " radio-dialog-portrait-active" : "");

    const img = document.createElement("img");
    img.className = "radio-dialog-portrait-img";
    img.src = participant.portrait;
    img.alt = participant.name;
    img.draggable = false;

    const label = document.createElement("div");
    label.className = "radio-dialog-portrait-label";
    label.textContent = participant.name;

    slot.appendChild(img);
    slot.appendChild(label);
    return slot;
}

export function showRadioDialog({ participants, line, lineIndex, lineCount }) {
    bindElements();
    if (!elements.overlay) return;

    elements.portraitRow.innerHTML = "";
    const count = participants.length;
    participants.forEach((participant, index) => {
        const isActive = participant.id === line.speakerId;
        const sideClass = getPortraitSideClass(index, count);
        elements.portraitRow.appendChild(createPortraitSlot(participant, isActive, sideClass));
    });

    elements.speakerName.textContent = line.speakerName;
    elements.lineText.textContent = line.text;

    if (elements.hint) {
        elements.hint.textContent = lineIndex + 1 >= lineCount ? "Tap to close" : "Tap to continue";
    }

    elements.overlay.style.display = "flex";
    elements.overlay.setAttribute("aria-hidden", "false");
}

export function hideRadioDialog() {
    bindElements();
    if (!elements.overlay) return;

    elements.overlay.style.display = "none";
    elements.overlay.setAttribute("aria-hidden", "true");
    elements.portraitRow.innerHTML = "";
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
