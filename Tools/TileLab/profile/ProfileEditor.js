import { combatVisualSettings } from "../../../Config/Config.js";
import { getFloorProceduralProfile } from "../../../Config/floorProceduralConfig.js";
import { SliderControl } from "../ui/controls/SliderControl.js";
import { SelectControl } from "../ui/controls/SelectControl.js";
import {
    BLEND_OPTIONS,
    LAYER_OPTIONS,
    MOTIF_TYPES,
    PALETTE_FIELDS,
    WARP_FIELDS,
    getAnimatableMotifFields,
} from "./profileSchema.js";

export const RUNTIME_LAB_PROFILE_ID = "__labA__";
export const RUNTIME_LAB_MAP_PROFILE_ID = "__labA_map__";
let editorState = null;
let selectedMotifId = null;
let onChangeCallback = null;
let nextMotifId = 1;

function defaultAnimation() {
    return {
        enabled: false,
        editorMotifIndex: 0,
        paramPath: "hueShift",
        startValue: 0,
        endValue: 360,
        frames: 30,
        durationMs: 2000,
    };
}

function parseAnimationTargetPath(targetPath) {
    const match = /^motifs\[(\d+)\]\.(.+)$/.exec(targetPath ?? "");
    if (!match) {
        return null;
    }
    return { exportIndex: Number(match[1]), paramPath: match[2] };
}

function editorMotifIndexFromExportIndex(motifs, exportIndex) {
    let idx = 0;
    for (let i = 0; i < motifs.length; i++) {
        if (!motifs[i].enabled) {
            continue;
        }
        if (idx === exportIndex) {
            return i;
        }
        idx++;
    }
    return motifs.findIndex((row) => row.enabled);
}

function motifExportIndex(motifs, editorMotifIndex) {
    let idx = 0;
    for (let i = 0; i < motifs.length; i++) {
        if (!motifs[i].enabled) {
            continue;
        }
        if (i === editorMotifIndex) {
            return idx;
        }
        idx++;
    }
    return 0;
}

function animationFromProfile(profile, motifs) {
    const anim = profile.animation;
    if (!anim) {
        return defaultAnimation();
    }
    const parsed = parseAnimationTargetPath(anim.targetPath);
    const editorMotifIndex = parsed
        ? editorMotifIndexFromExportIndex(motifs, parsed.exportIndex)
        : 0;
    return {
        enabled: true,
        editorMotifIndex: Math.max(0, editorMotifIndex),
        paramPath: parsed?.paramPath ?? "hueShift",
        startValue: anim.startValue ?? 0,
        endValue: anim.endValue ?? 360,
        frames: anim.frames ?? 30,
        durationMs: anim.durationMs ?? 2000,
    };
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getByPath(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (const part of parts) {
        if (cur == null) {
            return undefined;
        }
        cur = cur[part];
    }
    return cur;
}

function setByPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (cur[part] == null) {
            cur[part] = {};
        }
        cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
}

function defaultWarp() {
    return { frequency: 0.005, amplitude: 0, octaves: 1, sampleOffset: [0, 0] };
}

function defaultPalette() {
    return {
        base: [22, 24, 28],
        floorBase: [20, 22, 26],
        wallBase: [24, 26, 30],
        shadow: combatVisualSettings.floorShadow,
    };
}

function motifsFromProfile(profile) {
    const rows = [];
    if (!profile.motifs) {
        return rows;
    }
    for (const motif of profile.motifs) {
        const config = deepClone(motif);
        const blendMode = config.blendMode ?? "add";
        const opacity = config.opacity ?? 1;
        delete config.blendMode;
        delete config.opacity;
        rows.push({
            id: `m${nextMotifId++}`,
            enabled: motif.enabled !== false,
            surfaceMask: motif.surfaceMask ?? "all",
            blendMode,
            opacity,
            config,
        });
    }
    return rows;
}

function loadEditorFromProfileId(profileId, { silent = false } = {}) {
    nextMotifId = 1;
    const profile = deepClone(getFloorProceduralProfile(profileId));
    const motifs = motifsFromProfile(profile);
    editorState = {
        sourceProfileId: profileId,
        warp: profile.warp ?? defaultWarp(),
        palette: { ...defaultPalette(), ...profile.palette },
        motifs,
        animation: animationFromProfile(profile, motifs),
    };
    if (editorState.animation.editorMotifIndex >= editorState.motifs.length) {
        editorState.animation.editorMotifIndex = 0;
    }
    const animRow = editorState.motifs[editorState.animation.editorMotifIndex];
    if (editorState.animation.enabled && animRow) {
        selectedMotifId = animRow.id;
    } else {
        selectedMotifId = editorState.motifs[0]?.id ?? null;
    }
    if (!silent) {
        notifyChange({ lightweight: true });
    }
    return editorState;
}

function getEditorState() {
    return editorState;
}

export function buildProfileFromEditor(state = editorState) {
    if (!state) {
        return null;
    }
    const profile = {
        warp: deepClone(state.warp),
        palette: deepClone(state.palette),
        motifs: [],
    };

    for (const row of state.motifs) {
        if (!row.enabled) {
            continue;
        }
        const config = deepClone(row.config);
        delete config.enabled;
        config.surfaceMask = row.surfaceMask;
        config.blendMode = row.blendMode ?? "add";
        config.opacity = row.opacity ?? 1;
        profile.motifs.push(config);
    }

    if (state.animation?.enabled) {
        const exportIdx = motifExportIndex(state.motifs, state.animation.editorMotifIndex);
        profile.animation = {
            targetPath: `motifs[${exportIdx}].${state.animation.paramPath}`,
            startValue: state.animation.startValue,
            endValue: state.animation.endValue,
            frames: Math.max(2, Math.round(state.animation.frames)),
            durationMs: Math.max(100, Math.round(state.animation.durationMs)),
        };
    }

    return profile;
}

export function exportProfileSnippet(state = editorState, varName = "myProfile") {
    const profile = buildProfileFromEditor(state);
    const json = JSON.stringify(profile, null, 4);
    return `const ${varName} = ${json};`;
}

function notifyChange(options = {}) {
    onChangeCallback?.(options);
}

function getEditorPanels() {
    return {
        motifList: document.getElementById("motifList"),
        motifParams: document.getElementById("motifParamsPanel"),
        animationParams: document.getElementById("animationParamsPanel"),
        globalParams: document.getElementById("globalParamsPanel"),
    };
}

function refreshEditorPanels(options = {}) {
    const {
        motifList = true,
        motifParams = true,
        animation = true,
        global = false,
    } = options;
    const panels = getEditorPanels();
    if (motifList && panels.motifList) {
        renderMotifList(panels.motifList);
    }
    if (motifParams && panels.motifParams) {
        renderMotifParams(panels.motifParams);
    }
    if (animation && panels.animationParams) {
        renderAnimationParams(panels.animationParams);
    }
    if (global && panels.globalParams) {
        renderGlobalParams(panels.globalParams);
    }
}

function getSelectedMotifIndex() {
    if (!selectedMotifId || !editorState?.motifs.length) {
        return -1;
    }
    return editorState.motifs.findIndex((row) => row.id === selectedMotifId);
}

function getSelectedMotifRow() {
    const index = getSelectedMotifIndex();
    if (index < 0) {
        return null;
    }
    return editorState.motifs[index];
}

function syncAnimationMotifIndex() {
    const index = getSelectedMotifIndex();
    if (index >= 0 && editorState?.animation) {
        editorState.animation.editorMotifIndex = index;
    }
}

function syncAnimationParamRange() {
    if (!editorState?.animation) {
        return;
    }
    syncAnimationMotifIndex();
    const row = getSelectedMotifRow();
    const fields = getAnimatableMotifFields(row?.config);
    if (fields.length === 0) {
        return;
    }
    if (!fields.some((field) => field.path === editorState.animation.paramPath)) {
        editorState.animation.paramPath = fields[0].path;
    }
    const field = fields.find((f) => f.path === editorState.animation.paramPath) ?? fields[0];
    const current = Number(getByPath(row.config, field.path) ?? field.min ?? 0);
    const min = field.min ?? 0;
    const max = field.max ?? current + 180;
    editorState.animation.startValue = current;
    let end = editorState.animation.endValue;
    if (!Number.isFinite(end) || end <= min || end > max || end === current) {
        end = max;
    }
    editorState.animation.endValue = end;
}

function selectMotifById(motifId, { syncAnimation = true } = {}) {
    selectedMotifId = motifId;
    if (syncAnimation) {
        syncAnimationParamRange();
    } else {
        syncAnimationMotifIndex();
    }
    refreshEditorPanels({ global: false });
}

function renderMotifList(container) {
    container.innerHTML = "";
    if (!editorState) {
        return;
    }

    for (let i = 0; i < editorState.motifs.length; i++) {
        const row = editorState.motifs[i];
        const item = document.createElement("div");
        item.className = `motif-row${row.id === selectedMotifId ? " selected" : ""}`;
        item.dataset.id = row.id;

        const label = MOTIF_TYPES[row.config.type]?.label ?? row.config.type;

        // Build blend mode select inline in row
        const blendSel = document.createElement("select");
        blendSel.className = "motif-row-blend";
        for (const mode of BLEND_OPTIONS) {
            const o = document.createElement("option");
            o.value = mode;
            o.textContent = mode;
            if (mode === (row.blendMode ?? "add")) o.selected = true;
            blendSel.appendChild(o);
        }
        blendSel.addEventListener("change", (e) => {
            row.blendMode = e.target.value;
            notifyChange();
        });
        blendSel.addEventListener("click", (e) => e.stopPropagation());

        item.innerHTML = `
            <label class="motif-enable"><input type="checkbox" data-action="toggle" ${row.enabled ? "checked" : ""}></label>
            <span class="motif-label">${label}</span>
            <span class="motif-layer">${row.surfaceMask}</span>
            <span class="motif-blend-slot"></span>
            <span class="motif-actions">
                <button type="button" data-action="up" title="Move up">↑</button>
                <button type="button" data-action="down" title="Move down">↓</button>
                <button type="button" data-action="remove" title="Remove">✕</button>
            </span>
        `;
        item.querySelector(".motif-blend-slot").appendChild(blendSel);

        item.addEventListener("click", (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) {
                return;
            }
            selectMotifById(row.id);
        });

        item.querySelector('[data-action="toggle"]').addEventListener("change", (e) => {
            row.enabled = e.target.checked;
            notifyChange();
            refreshEditorPanels({ motifParams: false, animation: true, global: false });
        });
        item.querySelector('[data-action="up"]').addEventListener("click", () => {
            if (i > 0) {
                const tmp = editorState.motifs[i - 1];
                editorState.motifs[i - 1] = editorState.motifs[i];
                editorState.motifs[i] = tmp;
                syncAnimationMotifIndex();
                refreshEditorPanels();
                notifyChange();
            }
        });
        item.querySelector('[data-action="down"]').addEventListener("click", () => {
            if (i < editorState.motifs.length - 1) {
                const tmp = editorState.motifs[i + 1];
                editorState.motifs[i + 1] = editorState.motifs[i];
                editorState.motifs[i] = tmp;
                syncAnimationMotifIndex();
                refreshEditorPanels();
                notifyChange();
            }
        });
        item.querySelector('[data-action="remove"]').addEventListener("click", () => {
            editorState.motifs.splice(i, 1);
            if (selectedMotifId === row.id) {
                selectedMotifId = editorState.motifs[0]?.id ?? null;
                syncAnimationParamRange();
            } else if (editorState.animation) {
                const selectedIndex = getSelectedMotifIndex();
                if (selectedIndex >= 0) {
                    editorState.animation.editorMotifIndex = selectedIndex;
                }
            }
            refreshEditorPanels();
            notifyChange();
        });

        container.appendChild(item);
    }
}

function renderScalarFields(container, target, fields, changeOptions = {}) {
    for (const field of fields) {
        if (field.options) {
            const val = getByPath(target, field.path) ?? field.options[0];
            const select = new SelectControl(field.label, field.options, val, (newVal) => {
                setByPath(target, field.path, newVal);
                notifyChange(changeOptions);
            });
            container.appendChild(select.element);
        } else {
            const value = getByPath(target, field.path);
            const num = Number(value ?? 0);
            const slider = new SliderControl(field.label, field.min, field.max, field.step, num, (newVal) => {
                setByPath(target, field.path, newVal);
                notifyChange(changeOptions);
            });
            container.appendChild(slider.element);
        }
    }
}

function renderMotifParams(container) {
    container.innerHTML = "";
    if (!editorState || !selectedMotifId) {
        container.textContent = "Select a motif layer.";
        return;
    }
    const row = editorState.motifs.find((m) => m.id === selectedMotifId);
    if (!row) {
        return;
    }
    const schema = MOTIF_TYPES[row.config.type];
    if (!schema) {
        container.textContent = `No schema for ${row.config.type}`;
        return;
    }

    const layerSelect = new SelectControl("Surface Mask", LAYER_OPTIONS, row.surfaceMask, (val) => {
        row.surfaceMask = val;
        notifyChange();
        refreshEditorPanels({ motifParams: false, animation: true, global: false });
    });
    container.appendChild(layerSelect.element);

    renderScalarFields(
        container,
        row.config,
        schema.fields.filter((field) => field.path !== "blendMode")
    );
}

function renderGlobalParams(container) {
    container.innerHTML = "";
    if (!editorState) {
        return;
    }
    const warpRoot = { warp: editorState.warp };
    const paletteRoot = { palette: editorState.palette };
    const h = document.createElement("h4");
    h.className = "editor-subhead";
    h.textContent = "Warp";
    container.appendChild(h);
    renderScalarFields(container, warpRoot, WARP_FIELDS);
    editorState.warp = warpRoot.warp;

    const h2 = document.createElement("h4");
    h2.className = "editor-subhead";
    h2.textContent = "Palette";
    container.appendChild(h2);
    renderScalarFields(container, paletteRoot, PALETTE_FIELDS);
    editorState.palette = paletteRoot.palette;
}

function renderAnimationParams(container) {
    container.innerHTML = "";
    if (!editorState) {
        return;
    }

    const enableWrap = document.createElement("label");
    enableWrap.className = "check-inline";
    enableWrap.style.display = "block";
    enableWrap.style.marginBottom = "8px";
    const enableInput = document.createElement("input");
    enableInput.type = "checkbox";
    enableInput.checked = editorState.animation.enabled === true;
    enableInput.addEventListener("change", () => {
        editorState.animation.enabled = enableInput.checked;
        notifyChange({ lightweight: true });
        renderAnimationParams(container);
    });
    enableWrap.appendChild(enableInput);
    enableWrap.append(" Enable tile animation");
    container.appendChild(enableWrap);

    if (!editorState.animation.enabled) {
        const hint = document.createElement("p");
        hint.className = "editor-hint";
        hint.textContent = "Select a motif layer, pick a parameter below, then export as WebM from Tile inspect.";
        container.appendChild(hint);
        return;
    }

    const row = getSelectedMotifRow();
    if (!row) {
        const msg = document.createElement("p");
        msg.className = "editor-hint";
        msg.textContent = "Select a motif layer to configure animation.";
        container.appendChild(msg);
        return;
    }

    const label = MOTIF_TYPES[row.config.type]?.label ?? row.config.type;
    const targetHint = document.createElement("p");
    targetHint.className = "editor-hint";
    targetHint.textContent = `Target: ${label} (${row.surfaceMask})`;
    container.appendChild(targetHint);

    if (!row.enabled) {
        const msg = document.createElement("p");
        msg.className = "editor-hint";
        msg.textContent = "Enable this motif layer to animate it.";
        container.appendChild(msg);
        return;
    }

    syncAnimationMotifIndex();
    const animFields = getAnimatableMotifFields(row.config);
    if (animFields.length === 0) {
        const msg = document.createElement("p");
        msg.className = "editor-hint";
        msg.textContent = "Selected motif has no numeric sliders.";
        container.appendChild(msg);
        return;
    }

    const paramOptions = animFields.map((field) => ({
        value: field.path,
        label: field.label,
    }));
    const paramSelect = new SelectControl(
        "Animated parameter",
        paramOptions,
        editorState.animation.paramPath,
        (val) => {
            editorState.animation.paramPath = val;
            syncAnimationParamRange();
            notifyChange({ lightweight: true });
            renderAnimationParams(container);
        }
    );
    container.appendChild(paramSelect.element);

    const activeField = animFields.find((f) => f.path === editorState.animation.paramPath) ?? animFields[0];
    editorState.animation.paramPath = activeField.path;

    const animRoot = { animation: editorState.animation };
    renderScalarFields(container, animRoot, [
        { path: "animation.startValue", label: "Start", min: activeField.min, max: activeField.max, step: activeField.step },
        { path: "animation.endValue", label: "End", min: activeField.min, max: activeField.max, step: activeField.step },
        { path: "animation.frames", label: "Frames", min: 2, max: 120, step: 1 },
        { path: "animation.durationMs", label: "Duration (ms)", min: 200, max: 20000, step: 100 },
    ], { lightweight: true });
    editorState.animation = animRoot.animation;
}

export function initProfileEditor({ onChange }) {
    onChangeCallback = onChange;
    const exportArea = document.getElementById("profileExport");
    const addSelect = document.getElementById("addMotifType");
    const loadBtn = document.getElementById("loadPresetBtn");
    const copyExportBtn = document.getElementById("copyExportBtn");
    const presetSelect = document.getElementById("presetSelect");

    for (const type of Object.keys(MOTIF_TYPES)) {
        const opt = document.createElement("option");
        opt.value = type;
        opt.textContent = MOTIF_TYPES[type].label;
        addSelect.appendChild(opt);
    }

    document.getElementById("addMotifBtn").addEventListener("click", () => {
        const type = addSelect.value;
        const schema = MOTIF_TYPES[type];
        if (!schema || !editorState) {
            return;
        }
        const row = {
            id: `m${nextMotifId++}`,
            enabled: true,
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1,
            config: deepClone(schema.defaults),
        };
        editorState.motifs.push(row);
        selectMotifById(row.id);
        notifyChange();
    });

    loadBtn.addEventListener("click", () => {
        loadEditorFromProfileId(presetSelect.value, { silent: true });
        syncAnimationMotifIndex();
        refreshEditorPanels({ global: true });
        exportArea.value = exportProfileSnippet();
        notifyChange({ lightweight: true });
    });

    copyExportBtn.addEventListener("click", async () => {
        exportArea.value = exportProfileSnippet();
        await navigator.clipboard.writeText(exportArea.value);
    });

    onChangeCallback = (options) => {
        if (exportArea) {
            exportArea.value = exportProfileSnippet();
        }
        onChange?.(options);
    };

    loadEditorFromProfileId(presetSelect?.value || "techCorridor", { silent: true });
    syncAnimationMotifIndex();
    refreshEditorPanels({ global: true });
    exportArea.value = exportProfileSnippet();
}

export function getActiveLabProfile() {
    return buildProfileFromEditor();
}

/** Map preview uses a static profile so chunks never sync-bake animation frames. */
export function getActiveLabMapProfile() {
    return buildProfileFromEditor();
}
