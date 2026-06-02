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
} from "./profileSchema.js";

export const RUNTIME_LAB_PROFILE_ID = "__labA__";
let editorState = null;
let selectedMotifId = null;
let onChangeCallback = null;
let nextMotifId = 1;

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
    editorState = {
        sourceProfileId: profileId,
        warp: profile.warp ?? defaultWarp(),
        palette: { ...defaultPalette(), ...profile.palette },
        motifs: motifsFromProfile(profile),
    };
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
