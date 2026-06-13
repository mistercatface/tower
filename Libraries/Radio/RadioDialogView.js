const DEFAULT_ELEMENT_IDS = { overlay: "radioDialog", portraitRow: "radioPortraitRow", speakerName: "radioSpeakerName", lineText: "radioLineText", advanceBtn: "radioDialogAdvanceBtn" };
/**
 * Codec-style radio dialog DOM view (portraits + line text).
 *
 * @param {{
 *   mainCharacterId: string,
 *   elementIds?: Partial<typeof DEFAULT_ELEMENT_IDS>,
 *   getSpeaker?: (speakerId: string) => object | null,
 *   rootElement?: HTMLElement | Document
 * }} config
 */
export function createRadioDialogView({ mainCharacterId, elementIds = {}, getSpeaker = null, rootElement = document }) {
    const ids = { ...DEFAULT_ELEMENT_IDS, ...elementIds };
    const elements = { overlay: null, portraitRow: null, speakerName: null, lineText: null, hint: null };
    let keyListenerBound = false;
    /** Pointer id for an advance tap that started on the radio button. */
    let advancePointerId = null;
    /** Last non-main speaker — stays on the right through main character's reply. */
    let lastRemoteSpeaker = null;
    function getEl(id) {
        return rootElement.querySelector(`#${id}`);
    }
    function bindElements() {
        elements.overlay = getEl(ids.overlay);
        elements.portraitRow = getEl(ids.portraitRow);
        elements.speakerName = getEl(ids.speakerName);
        elements.lineText = getEl(ids.lineText);
        elements.hint = elements.overlay?.querySelector(".radio-dialog-hint") ?? null;
    }
    function findParticipant(participants, id) {
        return participants.find((p) => p.id === id) ?? null;
    }
    function resolveSpeaker(participants, speakerId) {
        const fromList = findParticipant(participants, speakerId);
        if (fromList) return fromList;
        if (!getSpeaker) return null;
        const speaker = getSpeaker(speakerId);
        if (!speaker) return null;
        return { id: speakerId, ...speaker };
    }
    function getMainCharacter(participants) {
        return resolveSpeaker(participants, mainCharacterId);
    }
    function createPortraitSlot(sideClass, participant, isActive, { empty = false } = {}) {
        const slot = document.createElement("div");
        slot.className = "radio-dialog-portrait-slot" + sideClass + (isActive ? " radio-dialog-portrait-active" : "");
        if (empty) slot.classList.add("radio-dialog-portrait-empty");
        const frame = document.createElement("div");
        frame.className = "radio-dialog-portrait-frame";
        slot.appendChild(frame);
        if (!empty && participant?.portrait) {
            const img = document.createElement("img");
            img.className = "radio-dialog-portrait-img";
            img.src = participant.portrait;
            img.alt = participant.name;
            img.draggable = false;
            frame.appendChild(img);
        }
        const label = document.createElement("div");
        label.className = "radio-dialog-portrait-label";
        if (!empty && participant) label.textContent = participant.name;
        slot.appendChild(label);
        return slot;
    }
    function show({ participants, line, lineIndex, lineCount }) {
        bindElements();
        if (!elements.overlay) return;
        elements.portraitRow.innerHTML = "";
        const mainCharacter = getMainCharacter(participants);
        const isMainSpeaking = line.speakerId === mainCharacterId;
        if (!isMainSpeaking) lastRemoteSpeaker = resolveSpeaker(participants, line.speakerId);
        const remoteSpeaker = lastRemoteSpeaker;
        const isRemoteSpeaking = !isMainSpeaking && remoteSpeaker != null;
        if (mainCharacter) elements.portraitRow.appendChild(createPortraitSlot(" radio-dialog-portrait-left", mainCharacter, isMainSpeaking));
        elements.portraitRow.appendChild(createPortraitSlot(" radio-dialog-portrait-right", remoteSpeaker, isRemoteSpeaking, { empty: !remoteSpeaker }));
        elements.speakerName.textContent = line.speakerName;
        elements.lineText.textContent = line.text;
        if (elements.hint) elements.hint.textContent = lineIndex + 1 >= lineCount ? "Tap to close" : "Tap to continue";
        elements.overlay.style.display = "flex";
    }
    function hide() {
        bindElements();
        if (!elements.overlay) return;
        const advanceBtn = getEl(ids.advanceBtn);
        if (advanceBtn && document.activeElement === advanceBtn) advanceBtn.blur();
        elements.overlay.style.display = "none";
        elements.portraitRow.innerHTML = "";
        lastRemoteSpeaker = null;
        advancePointerId = null;
    }
    function bindAdvanceInput(onAdvance) {
        bindElements();
        function onAdvanceInput(e) {
            if (elements.overlay?.style.display !== "flex") return;
            if (e.type === "keydown") {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
            }
            onAdvance();
        }
        const advanceBtn = getEl(ids.advanceBtn);
        if (advanceBtn && !advanceBtn.dataset.bound) {
            advanceBtn.dataset.bound = "1";
            advanceBtn.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                advancePointerId = e.pointerId;
            });
            advanceBtn.addEventListener("pointerup", (e) => {
                if (e.pointerId !== advancePointerId) return;
                advancePointerId = null;
                onAdvanceInput(e);
            });
            advanceBtn.addEventListener("pointercancel", (e) => {
                if (e.pointerId === advancePointerId) advancePointerId = null;
            });
        }
        if (!keyListenerBound) {
            keyListenerBound = true;
            document.addEventListener("keydown", onAdvanceInput);
        }
    }
    return { show, hide, bindAdvanceInput };
}
