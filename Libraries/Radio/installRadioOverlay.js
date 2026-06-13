import { createRadioSystem } from "./createRadioSystem.js";
const RADIO_DIALOG_STYLE_ID = "radio-dialog-css";
function ensureRadioDialogStyles() {
    if (document.getElementById(RADIO_DIALOG_STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = RADIO_DIALOG_STYLE_ID;
    link.rel = "stylesheet";
    link.href = new URL("./radioDialog.css", import.meta.url).href;
    document.head.appendChild(link);
}
/** @param {HTMLElement} host */
function mountRadioDialogDom(host) {
    const overlay = document.createElement("div");
    overlay.id = "radioDialog";
    overlay.className = "radio-dialog";
    overlay.style.display = "none";
    const screen = document.createElement("button");
    screen.type = "button";
    screen.className = "radio-dialog-screen";
    screen.id = "radioDialogAdvanceBtn";
    const portraitRow = document.createElement("div");
    portraitRow.id = "radioPortraitRow";
    portraitRow.className = "radio-dialog-portraits";
    const textPanel = document.createElement("div");
    textPanel.className = "radio-dialog-text-panel";
    const speakerName = document.createElement("div");
    speakerName.id = "radioSpeakerName";
    speakerName.className = "radio-dialog-speaker";
    const lineText = document.createElement("div");
    lineText.id = "radioLineText";
    lineText.className = "radio-dialog-line";
    const hint = document.createElement("div");
    hint.className = "radio-dialog-hint";
    hint.textContent = "Tap to continue";
    textPanel.append(speakerName, lineText);
    screen.append(portraitRow, textPanel, hint);
    overlay.appendChild(screen);
    host.appendChild(overlay);
    return overlay;
}
/**
 * Mount radio DOM on the game wrapper and wire the event bus (same boot level as FloatingText handlers).
 *
 * @param {HTMLElement} host — typically `#gameWrapper`
 * @param {{
 *   eventBus: import("../Events/EventBus.js").EventBus,
 *   requestPause: (reason: string) => void,
 *   requestResume: (reason: string) => void,
 *   content: { conversations: Record<string, object>, speakers: Record<string, object>, mainCharacterId: string },
 * }} options
 */
export function installRadioOverlay(host, { eventBus, requestPause, requestResume, content }) {
    ensureRadioDialogStyles();
    const rootElement = mountRadioDialogDom(host);
    const system = createRadioSystem(content);
    system.wire(eventBus, { requestPause, requestResume, rootElement });
    return system;
}
