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

function loadEditorFromProfileId(profileId) {
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
    selectedMotifId = editorState.motifs[0]?.id ?? null;
    notifyChange();
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

function notifyChange() {
    onChangeCallback?.();
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
            if (e.target.closest("button") || e.target.closest("input")) {
                return;
            }
            selectedMotifId = row.id;
            renderMotifList(container);
            renderMotifParams(document.getElementById("motifParamsPanel"));
        });

        item.querySelector('[data-action="toggle"]').addEventListener("change", (e) => {
            row.enabled = e.target.checked;
            notifyChange();
        });
        item.querySelector('[data-action="up"]').addEventListener("click", () => {
            if (i > 0) {
                const tmp = editorState.motifs[i - 1];
                editorState.motifs[i - 1] = editorState.motifs[i];
                editorState.motifs[i] = tmp;
                renderMotifList(container);
                notifyChange();
            }
        });
        item.querySelector('[data-action="down"]').addEventListener("click", () => {
            if (i < editorState.motifs.length - 1) {
                const tmp = editorState.motifs[i + 1];
                editorState.motifs[i + 1] = editorState.motifs[i];
                editorState.motifs[i] = tmp;
                renderMotifList(container);
                notifyChange();
            }
        });
        item.querySelector('[data-action="remove"]').addEventListener("click", () => {
            editorState.motifs.splice(i, 1);
            if (selectedMotifId === row.id) {
                selectedMotifId = editorState.motifs[0]?.id ?? null;
            }
            renderMotifList(container);
            renderMotifParams(document.getElementById("motifParamsPanel"));
            notifyChange();
        });

        container.appendChild(item);
    }
}

function renderScalarFields(container, target, fields) {
    for (const field of fields) {
        if (field.options) {
            const val = getByPath(target, field.path) ?? field.options[0];
            const select = new SelectControl(field.label, field.options, val, (newVal) => {
                setByPath(target, field.path, newVal);
                notifyChange();
            });
            container.appendChild(select.element);
        } else {
            const value = getByPath(target, field.path);
            const num = Number(value ?? 0);
            const slider = new SliderControl(field.label, field.min, field.max, field.step, num, (newVal) => {
                setByPath(target, field.path, newVal);
                notifyChange();
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
        renderMotifList(document.getElementById("motifList"));
    });
    container.appendChild(layerSelect.element);

    renderScalarFields(container, row.config, schema.fields);
}

function renderGlobalParams(container) {
    container.innerHTML = "";
    if (!editorState) {
        return;
    }
    const warpRoot = { warp: editorState.warp };
    const paletteRoot = { palette: editorState.palette };
    const h = document.createElement("h3");
    h.textContent = "Warp";
    container.appendChild(h);
    renderScalarFields(container, warpRoot, WARP_FIELDS);
    editorState.warp = warpRoot.warp;

    const h2 = document.createElement("h3");
    h2.textContent = "Palette";
    container.appendChild(h2);
    renderScalarFields(container, paletteRoot, PALETTE_FIELDS);
    editorState.palette = paletteRoot.palette;

    renderAnimationParams(container);
}

function getSelectedMotifRow() {
    if (!editorState?.motifs.length) {
        return null;
    }
    const idx = editorState.animation?.editorMotifIndex ?? 0;
    return editorState.motifs[idx] ?? editorState.motifs[0];
}

function syncAnimationParamDefaults(row) {
    if (!row || !editorState?.animation) {
        return;
    }
    const fields = getAnimatableMotifFields(row.config);
    const field = fields.find((f) => f.path === editorState.animation.paramPath) ?? fields[0];
    if (!field) {
        return;
    }
    editorState.animation.paramPath = field.path;
    const current = Number(getByPath(row.config, field.path) ?? field.min ?? 0);
    if (editorState.animation.startValue === editorState.animation.endValue) {
        editorState.animation.startValue = current;
        editorState.animation.endValue = field.max ?? current + 180;
    }
}

function renderAnimationParams(container) {
    if (!editorState) {
        return;
    }
    const h = document.createElement("h3");
    h.textContent = "Animation";
    container.appendChild(h);

    const enableWrap = document.createElement("label");
    enableWrap.className = "check-inline";
    enableWrap.style.display = "block";
    enableWrap.style.marginBottom = "8px";
    const enableInput = document.createElement("input");
    enableInput.type = "checkbox";
    enableInput.checked = editorState.animation.enabled === true;
    enableInput.addEventListener("change", () => {
        editorState.animation.enabled = enableInput.checked;
        notifyChange();
        renderGlobalParams(container);
    });
    enableWrap.appendChild(enableInput);
    enableWrap.append(" Enable tile animation");
    container.appendChild(enableWrap);

    if (!editorState.animation.enabled) {
        const hint = document.createElement("p");
        hint.style.cssText = "margin:0;color:var(--muted);font-size:10px";
        hint.textContent = "Pick a motif slider to animate, then export as WebM from Tile inspect.";
        container.appendChild(hint);
        return;
    }

    const enabledRows = editorState.motifs
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.enabled);

    if (enabledRows.length === 0) {
        const msg = document.createElement("p");
        msg.textContent = "Enable at least one motif layer to animate.";
        container.appendChild(msg);
        return;
    }

    const motifOptions = enabledRows.map(({ row, index }) => {
        const label = MOTIF_TYPES[row.config.type]?.label ?? row.config.type;
        return { value: String(index), label: `${label} (${row.surfaceMask})` };
    });

    const motifSelect = new SelectControl(
        "Motif layer",
        motifOptions,
        String(editorState.animation.editorMotifIndex),
        (val) => {
            editorState.animation.editorMotifIndex = Number(val);
            syncAnimationParamDefaults(getSelectedMotifRow());
            notifyChange();
            renderGlobalParams(container);
        }
    );
    container.appendChild(motifSelect.element);

    const row = getSelectedMotifRow();
    const animFields = getAnimatableMotifFields(row?.config);
    if (animFields.length === 0) {
        const msg = document.createElement("p");
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
            syncAnimationParamDefaults(getSelectedMotifRow());
            notifyChange();
            renderGlobalParams(container);
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
    ]);
    editorState.animation = animRoot.animation;
}

export function initProfileEditor({ onChange }) {
    onChangeCallback = onChange;
    const motifList = document.getElementById("motifList");
    const motifParams = document.getElementById("motifParamsPanel");
    const globalParams = document.getElementById("globalParamsPanel");
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

    const tabBtns = document.querySelectorAll(".editor-tab-btn");
    const tabPanels = document.querySelectorAll(".editor-tab-panel");
    for (const btn of tabBtns) {
        btn.addEventListener("click", () => {
            tabBtns.forEach((b) => b.classList.remove("active"));
            tabPanels.forEach((p) => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(`editor-tab-${btn.dataset.tab}`)?.classList.add("active");
        });
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
        selectedMotifId = row.id;
        renderMotifList(motifList);
        renderMotifParams(motifParams);
        notifyChange();
    });

    loadBtn.addEventListener("click", () => {
        loadEditorFromProfileId(presetSelect.value);
        renderMotifList(motifList);
        renderMotifParams(motifParams);
        renderGlobalParams(globalParams);
        exportArea.value = exportProfileSnippet();
    });

    copyExportBtn.addEventListener("click", async () => {
        exportArea.value = exportProfileSnippet();
        await navigator.clipboard.writeText(exportArea.value);
    });

    onChangeCallback = () => {
        if (exportArea) {
            exportArea.value = exportProfileSnippet();
        }
        onChange?.();
    };

    loadEditorFromProfileId(presetSelect?.value || "techCorridor");
    renderMotifList(motifList);
    renderMotifParams(motifParams);
    renderGlobalParams(globalParams);
    exportArea.value = exportProfileSnippet();
}

export function getActiveLabProfile() {
    return buildProfileFromEditor();
}
