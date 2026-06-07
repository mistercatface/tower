import { adjustGameSpeed, toggleGamePause } from "../../Core/EventSystem.js";
import { getActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { getSpeedControlView, resolveStep } from "./playbackController.js";
/**
 * @typedef {object} SpeedControlElements
 * @property {HTMLElement} [root]
 * @property {HTMLButtonElement | null} [speedDownBtn]
 * @property {HTMLButtonElement | null} [pauseBtn]
 * @property {HTMLElement | null} [pauseLabel]
 * @property {HTMLElement | null} [speedLabel]
 * @property {HTMLButtonElement | null} [speedUpBtn]
 */
/**
 * @typedef {object} MountSpeedControlOptions
 * @property {string} [className]
 * @property {string} [buttonClass]
 * @property {string} [pauseButtonClass]
 */
/**
 * @param {ParentNode} parent
 * @param {MountSpeedControlOptions} [options]
 * @returns {SpeedControlElements}
 */
export function mountSpeedControl(parent, options = {}) {
    const { className = "speed-control", buttonClass = "", pauseButtonClass = "" } = options;
    const root = document.createElement("div");
    root.className = className;
    root.dataset.speedControl = "";
    const speedDownBtn = document.createElement("button");
    speedDownBtn.type = "button";
    speedDownBtn.dataset.speedDown = "";
    speedDownBtn.className = ["speed-control-down", buttonClass].filter(Boolean).join(" ");
    speedDownBtn.textContent = "–";
    const pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.dataset.speedPause = "";
    pauseBtn.className = ["speed-control-pause", pauseButtonClass || buttonClass].filter(Boolean).join(" ");
    const pauseLabel = document.createElement("span");
    pauseLabel.dataset.pauseLabel = "";
    pauseLabel.textContent = "PAUSE";
    const speedLabel = document.createElement("span");
    speedLabel.dataset.speedLabel = "";
    speedLabel.className = "speed-control-speed-label";
    speedLabel.textContent = "1.00x";
    pauseBtn.append(pauseLabel, speedLabel);
    const speedUpBtn = document.createElement("button");
    speedUpBtn.type = "button";
    speedUpBtn.dataset.speedUp = "";
    speedUpBtn.className = ["speed-control-up", buttonClass].filter(Boolean).join(" ");
    speedUpBtn.textContent = "+";
    root.append(speedDownBtn, pauseBtn, speedUpBtn);
    parent.appendChild(root);
    return bindSpeedControlElements(root);
}
/**
 * @param {ParentNode} root
 * @returns {SpeedControlElements}
 */
export function bindSpeedControlElements(root) {
    return {
        root: /** @type {HTMLElement} */ (root instanceof HTMLElement ? root : root.firstElementChild),
        speedDownBtn: /** @type {HTMLButtonElement | null} */ (root.querySelector("[data-speed-down]")),
        pauseBtn: /** @type {HTMLButtonElement | null} */ (root.querySelector("[data-speed-pause]")),
        pauseLabel: root.querySelector("[data-pause-label]"),
        speedLabel: root.querySelector("[data-speed-label]"),
        speedUpBtn: /** @type {HTMLButtonElement | null} */ (root.querySelector("[data-speed-up]")),
    };
}
/**
 * @param {SpeedControlElements} elements
 * @param {import("../../Core/GameDefinitionTypes.js").GameDefinition | null | undefined} [definition]
 */
export function wireSpeedControl(elements, definition) {
    const def = definition ?? getActiveGameDefinition();
    const step = resolveStep(def);
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
    const view = getSpeedControlView(state, definition ?? getActiveGameDefinition());
    if (elements.pauseLabel) elements.pauseLabel.textContent = view.pauseLabel;
    if (elements.speedLabel) elements.speedLabel.textContent = view.speedLabel;
    if (elements.speedDownBtn) elements.speedDownBtn.style.opacity = view.canDecrease ? "1" : "0.5";
    if (elements.speedUpBtn) elements.speedUpBtn.style.opacity = view.canIncrease ? "1" : "0.5";
    return view;
}
