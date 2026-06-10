import { engine } from "../../Apps/Editor/engine.js";
import { clampSelectedSpeed, getSpeedControlView, resolveStep } from "./playbackController.js";
/**
 * @typedef {object} SpeedControlClassNames
 * @property {string} [root]
 * @property {string} [button]
 * @property {string} [pause]
 */
/**
 * @typedef {object} SpeedControlIds
 * @property {string} [root]
 * @property {string} [down]
 * @property {string} [pause]
 * @property {string} [pauseLabel]
 * @property {string} [speedLabel]
 * @property {string} [up]
 */
/**
 * @typedef {object} ApplySpeedControlOptions
 * @property {boolean} [inject]
 * @property {SpeedControlClassNames} [classNames]
 * @property {SpeedControlIds} [ids]
 */
/**
 * @typedef {object} SpeedControlHandle
 * @property {HTMLElement | null} root
 * @property {(state: object) => void} refresh
 */
const wiredHosts = new WeakSet();
/** @param {ApplySpeedControlOptions} options */
function buildSpeedControlMarkup(options) {
    const { classNames = {}, ids = {} } = options;
    const rootClass = classNames.root ?? "speed-control";
    const buttonClass = classNames.button ?? "";
    const pauseClass = classNames.pause ?? buttonClass;
    const attrId = (key) => (ids[key] ? ` id="${ids[key]}"` : "");
    const cls = (...parts) => parts.filter(Boolean).join(" ");
    const rootAttr = ids.root ? ` id="${ids.root}"` : "";
    return `<div class="${rootClass}"${rootAttr}>
<button type="button" data-speed-down class="${cls("speed-control-down", buttonClass)}"${attrId("down")}>–</button>
<button type="button" data-speed-pause class="${cls("speed-control-pause", pauseClass)}"${attrId("pause")}>
<span data-pause-label${attrId("pauseLabel")}>PAUSE</span>
<span data-speed-label class="speed-control-speed-label"${attrId("speedLabel")}>1.00x</span>
</button>
<button type="button" data-speed-up class="${cls("speed-control-up", buttonClass)}"${attrId("up")}>+</button>
</div>`;
}
/** @param {ParentNode} scope */
function querySpeedControlElements(scope) {
    return {
        root: scope instanceof HTMLElement && scope.classList.contains("speed-control") ? scope : scope.querySelector(".speed-control"),
        speedDownBtn: /** @type {HTMLButtonElement | null} */ (scope.querySelector("[data-speed-down]")),
        pauseBtn: /** @type {HTMLButtonElement | null} */ (scope.querySelector("[data-speed-pause]")),
        pauseLabel: scope.querySelector("[data-pause-label]"),
        speedLabel: scope.querySelector("[data-speed-label]"),
        speedUpBtn: /** @type {HTMLButtonElement | null} */ (scope.querySelector("[data-speed-up]")),
    };
}
/**
 * @param {ParentNode | null} host
 * @param {ApplySpeedControlOptions} [options]
 * @returns {SpeedControlHandle}
 */
export function applySpeedControl(host, options = {}) {
    const noop = { root: null, refresh: () => {} };
    if (!host) return noop;
    const { inject = false, classNames, ids } = options;
    if (inject || !host.querySelector("[data-speed-pause]")) host.innerHTML = buildSpeedControlMarkup({ classNames, ids });
    const elements = querySpeedControlElements(host);
    const root = elements.root instanceof HTMLElement ? elements.root : null;
    if (!wiredHosts.has(host)) {
        wiredHosts.add(host);
        elements.speedDownBtn?.addEventListener("click", () => engine.playbackHandlers?.adjustSpeed(-resolveStep()));
        elements.speedUpBtn?.addEventListener("click", () => engine.playbackHandlers?.adjustSpeed(resolveStep()));
        elements.pauseBtn?.addEventListener("click", () => engine.playbackHandlers?.togglePause());
    }
    return {
        root,
        refresh(state) {
            clampSelectedSpeed(state);
            const view = getSpeedControlView(state);
            if (elements.pauseLabel) elements.pauseLabel.textContent = view.pauseLabel;
            if (elements.speedLabel) elements.speedLabel.textContent = view.speedLabel;
            if (elements.speedDownBtn) elements.speedDownBtn.style.opacity = view.canDecrease ? "1" : "0.5";
            if (elements.speedUpBtn) elements.speedUpBtn.style.opacity = view.canIncrease ? "1" : "0.5";
        },
    };
}
