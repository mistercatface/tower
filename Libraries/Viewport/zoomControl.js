/**
 * @typedef {object} ZoomControlClassNames
 * @property {string} [root]
 * @property {string} [slider]
 * @property {string} [label]
 * @property {string} [prefix]
 */
/**
 * @typedef {object} ZoomControlIds
 * @property {string} [slider]
 * @property {string} [label]
 */
/**
 * @typedef {object} ApplyZoomControlOptions
 * @property {boolean} [inject]
 * @property {string} [prefix]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {ZoomControlClassNames} [classNames]
 * @property {ZoomControlIds} [ids]
 * @property {(ctx?: object) => number | null | undefined} [getZoom]
 * @property {(zoom: number, ctx?: object) => void} [setZoom]
 * @property {(zoom: number, ctx?: object) => number} [zoomToSlider]
 * @property {(sliderVal: number, ctx?: object) => number} [sliderToZoom]
 * @property {(zoom: number, ctx?: object) => string} [formatLabel]
 */
/**
 * @typedef {object} ZoomControlHandle
 * @property {HTMLElement | null} root
 * @property {(ctx?: object) => void} refresh
 * @property {(zoom: number, ctx?: object) => void} setZoom
 */
const wiredHosts = new WeakSet();
/**
 * @param {ApplyZoomControlOptions} options
 */
function buildZoomControlMarkup(options) {
    const { classNames = {}, ids = {}, prefix = "Cam", min = 0, max = 100, step = 1 } = options;
    const rootClass = classNames.root ?? "viewport-zoom-control";
    const sliderClass = classNames.slider ?? "viewport-zoom-control-slider premium-slider";
    const labelClass = classNames.label ?? "viewport-zoom-control-value";
    const prefixClass = classNames.prefix ?? "viewport-zoom-control-prefix";
    const sliderId = ids.slider ? ` id="${ids.slider}"` : "";
    const labelId = ids.label ? ` id="${ids.label}"` : "";
    const fmt = options.formatLabel ?? ((z) => String(z));
    const initial = fmt(min);
    return `<div class="${rootClass} viewport-zoom-control--inline">
<label class="viewport-zoom-control-wrap">
<span class="${prefixClass}">${prefix} </span>
<span data-zoom-label class="${labelClass}"${labelId}>${initial}</span>×
<input type="range" data-zoom-slider class="${sliderClass}"${sliderId} min="${min}" max="${max}" step="${step}" value="${min}">
</label>
</div>`;
}
/** @param {ParentNode} host @param {ZoomControlIds} ids */
function queryZoomControlElements(host, ids = {}) {
    const root = host instanceof HTMLElement && host.classList.contains("viewport-zoom-control") ? host : (host.querySelector(".viewport-zoom-control") ?? host);
    const slider = /** @type {HTMLInputElement | null} */ (ids.slider ? host.querySelector(`#${ids.slider}`) : (host.querySelector("[data-zoom-slider]") ?? host.querySelector('input[type="range"]')));
    const label = ids.label ? host.querySelector(`#${ids.label}`) : host.querySelector("[data-zoom-label]");
    return { root: root instanceof HTMLElement ? root : null, slider, label };
}
/** @param {ApplyZoomControlOptions} options @param {number} zoom @param {object | undefined} ctx */
function formatZoomLabel(options, zoom, ctx) {
    return (options.formatLabel ?? ((z) => String(z)))(zoom, ctx);
}
/** @param {ApplyZoomControlOptions} options @param {number} zoom @param {object | undefined} ctx */
function zoomToSliderValue(options, zoom, ctx) {
    return (options.zoomToSlider ?? ((z) => z))(zoom, ctx);
}
/** @param {ApplyZoomControlOptions} options @param {number} sliderVal @param {object | undefined} ctx */
function sliderToZoomValue(options, sliderVal, ctx) {
    return (options.sliderToZoom ?? ((s) => s))(sliderVal, ctx);
}
/**
 * Range + label bound to viewport zoom. Wire once; call `.refresh(ctx)` on HUD ticks.
 *
 * @param {ParentNode | null} host
 * @param {ApplyZoomControlOptions} [options]
 * @returns {ZoomControlHandle}
 */
export function applyZoomControl(host, options = {}) {
    const noop = { root: null, refresh: () => {}, setZoom: () => {} };
    if (!host) return noop;
    const { inject = false, ids, classNames, prefix, min, max, step, setZoom } = options;
    if (inject || !host.querySelector("[data-zoom-slider]")) host.innerHTML = buildZoomControlMarkup({ ...options, classNames, ids, prefix, min, max, step });
    const elements = queryZoomControlElements(host, ids);
    const root = elements.root instanceof HTMLElement ? elements.root : null;
    if (elements.slider) {
        if (min != null) elements.slider.min = String(min);
        if (max != null) elements.slider.max = String(max);
        if (step != null) elements.slider.step = String(step);
    }
    /** @param {number} zoom @param {object | undefined} ctx */
    const pushUi = (zoom, ctx) => {
        if (elements.slider) elements.slider.value = String(zoomToSliderValue(options, zoom, ctx));
        if (elements.label) elements.label.textContent = formatZoomLabel(options, zoom, ctx);
    };
    if (!wiredHosts.has(host)) {
        wiredHosts.add(host);
        elements.slider?.addEventListener("input", () => {
            const raw = parseFloat(elements.slider?.value ?? "0");
            const zoom = sliderToZoomValue(options, raw);
            if (elements.label) elements.label.textContent = formatZoomLabel(options, zoom);
            setZoom?.(zoom);
        });
    }
    return {
        root,
        refresh(ctx) {
            const zoom = options.getZoom?.(ctx);
            if (zoom == null || !Number.isFinite(zoom)) return;
            pushUi(zoom, ctx);
        },
        setZoom(zoom, ctx) {
            if (!Number.isFinite(zoom)) return;
            pushUi(zoom, ctx);
        },
    };
}
