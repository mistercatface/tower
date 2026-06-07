import { adjustGameSpeed, toggleGamePause } from "../../Core/EventSystem.js";
import { getActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { clampSelectedSpeed, getSpeedControlView, resolveStep } from "./playbackController.js";
/**
 * @typedef {object} SpeedControlElements
 * @property {HTMLElement | null} [root]
 * @property {HTMLButtonElement | null} [speedDownBtn]
 * @property {HTMLButtonElement | null} [pauseBtn]
 * @property {HTMLElement | null} [pauseLabel]
 * @property {HTMLElement | null} [speedLabel]
 * @property {HTMLButtonElement | null} [speedUpBtn]
 */
/**
 * @typedef {object} SpeedControlHtmlOptions
 * @property {string} [rootId]
 * @property {string} [rootClass]
 * @property {string} [buttonClass]
 * @property {string} [pauseButtonClass]
 * @property {{ down?: string, pause?: string, pauseLabel?: string, speedLabel?: string, up?: string }} [ids]
 */
/**
 * @param {SpeedControlHtmlOptions} [options]
 */
export function speedControlHtml(options = {}) {
    const { rootId, rootClass = "speed-control", buttonClass = "", pauseButtonClass = "", ids = {} } = options;
    const attrId = (key) => (ids[key] ? ` id="${ids[key]}"` : "");
    const cls = (...parts) => parts.filter(Boolean).join(" ");
    const rootAttr = rootId ? ` id="${rootId}"` : "";
    return `<div class="${rootClass}"${rootAttr}>
<button type="button" data-speed-down class="${cls("speed-control-down", buttonClass)}"${attrId("down")}>–</button>
<button type="button" data-speed-pause class="${cls("speed-control-pause", pauseButtonClass || buttonClass)}"${attrId("pause")}>
<span data-pause-label${attrId("pauseLabel")}>PAUSE</span>
<span data-speed-label class="speed-control-speed-label"${attrId("speedLabel")}>1.00x</span>
</button>
<button type="button" data-speed-up class="${cls("speed-control-up", buttonClass)}"${attrId("up")}>+</button>
</div>`;
}
/**
 * @param {ParentNode | null} host
 * @returns {SpeedControlElements}
 */
export function bindSpeedControl(host) {
    if (!host) return { root: null, speedDownBtn: null, pauseBtn: null, pauseLabel: null, speedLabel: null, speedUpBtn: null };
    const root = host.querySelector(".speed-control") ?? (host instanceof HTMLElement && host.classList.contains("speed-control") ? host : null);
    const scope = root ?? host;
    return {
        root: root instanceof HTMLElement ? root : null,
        speedDownBtn: /** @type {HTMLButtonElement | null} */ (scope.querySelector("[data-speed-down]")),
        pauseBtn: /** @type {HTMLButtonElement | null} */ (scope.querySelector("[data-speed-pause]")),
        pauseLabel: scope.querySelector("[data-pause-label]"),
        speedLabel: scope.querySelector("[data-speed-label]"),
        speedUpBtn: /** @type {HTMLButtonElement | null} */ (scope.querySelector("[data-speed-up]")),
    };
}
/**
 * @param {SpeedControlElements} elements
 * @param {import("../../Core/GameDefinitionTypes.js").GameDefinition | null | undefined} [definition]
 */
export function wireSpeedControl(elements, definition) {
    const step = resolveStep(definition ?? getActiveGameDefinition());
    elements.speedDownBtn?.addEventListener("click", () => adjustGameSpeed(-step));
    elements.speedUpBtn?.addEventListener("click", () => adjustGameSpeed(step));
    elements.pauseBtn?.addEventListener("click", () => toggleGamePause());
}
/**
 * @param {SpeedControlElements} elements
 * @param {object} state
 * @param {import("../../Core/GameDefinitionTypes.js").GameDefinition | null | undefined} [definition]
 */
export function syncSpeedControlDisplay(elements, state, definition) {
    const def = definition ?? getActiveGameDefinition();
    clampSelectedSpeed(state, def);
    const view = getSpeedControlView(state, def);
    if (elements.pauseLabel) elements.pauseLabel.textContent = view.pauseLabel;
    if (elements.speedLabel) elements.speedLabel.textContent = view.speedLabel;
    if (elements.speedDownBtn) elements.speedDownBtn.style.opacity = view.canDecrease ? "1" : "0.5";
    if (elements.speedUpBtn) elements.speedUpBtn.style.opacity = view.canIncrease ? "1" : "0.5";
    return view;
}
