import { resolveSurfaceProfile } from "../../../../Config/procedural/profiles.js";
import { exportPipelineJsModule } from "../../../../Libraries/Pipeline/exportPipeline.js";
import { deepClone, getByPath, movePipelineRow, pipelineRowId, remapIndexAfterSwap } from "../../../../Libraries/Pipeline/index.js";
import { SelectControl } from "../../../../Libraries/UI/controls/SelectControl.js";
import { setFormFieldName } from "../../../../Libraries/UI/Component.js";
import { renderPipelineListUi } from "../../../../Libraries/UI/pipelineListUi.js";
import { renderSchemaFields } from "../../../../Libraries/UI/renderSchemaFields.js";
import { appendEditorSubhead } from "../../../../Libraries/UI/paramFields.js";
import { mirrorEasingForReversedStage } from "../../../../Libraries/Math/math.js";
import { SURFACE_MASK_ALL, BLEND_MODE_ADD } from "../../../../Core/engineEnums.js";
import { BLEND_OPTIONS, EASING_OPTIONS, LAYER_OPTIONS, MOTIF_TYPES, PALETTE_FIELDS, WARP_FIELDS, getAnimatableMotifFields, isContextMotif } from "./profileSchema.js";
export const RUNTIME_LAB_PROFILE_ID = "__labA__";
let editorState = null;
let selectedMotifId = null;
let onChangeCallback = null;
let nextMotifId = 1;
function surfaceMaskLabel(mask) {
    return LAYER_OPTIONS.find((opt) => opt.id === mask)?.label ?? String(mask);
}
function defaultWarp() {
    return { frequency: 0.005, amplitude: 0, octaves: 1, sampleOffset: [0, 0] };
}
function defaultPalette() {
    return { base: [22, 24, 28], floorBase: [20, 22, 26], wallBase: [24, 26, 30] };
}
function motifsFromProfile(profile) {
    const rows = [];
    if (!profile.motifs) return rows;
    for (const motif of profile.motifs) {
        const config = deepClone(motif);
        const blendMode = config.blendMode ?? BLEND_MODE_ADD;
        delete config.blendMode;
        rows.push({ id: `m${nextMotifId++}`, enabled: motif.enabled !== false, surfaceMask: motif.surfaceMask ?? SURFACE_MASK_ALL, blendMode, config });
    }
    return rows;
}
function loadEditorFromProfileId(profileId, { silent = false } = {}) {
    nextMotifId = 1;
    const profile = deepClone(resolveSurfaceProfile(profileId));
    const motifs = motifsFromProfile(profile);
    editorState = { warp: profile.warp ?? defaultWarp(), palette: { ...defaultPalette(), ...profile.palette }, motifs };
    selectedMotifId = editorState.motifs[0]?.id ?? null;
    if (!silent) notifyChange({ lightweight: true });
    return editorState;
}
/** Headless Tile Lab / game runtime — same shipped preset as editor cold start. */
export function seedRuntimeLabProfile(profileId) {
    return loadEditorFromProfileId(profileId, { silent: true });
}
function getEditorState() {
    return editorState;
}
export function buildProfileFromEditor(state = editorState) {
    if (!state) return null;
    const profile = { warp: deepClone(state.warp), palette: deepClone(state.palette), motifs: [] };
    for (const row of state.motifs) {
        if (!row.enabled) continue;
        const config = deepClone(row.config);
        delete config.enabled;
        if (!isContextMotif(config.type)) {
            config.surfaceMask = row.surfaceMask;
            config.blendMode = row.blendMode ?? BLEND_MODE_ADD;
        }
        profile.motifs.push(config);
    }
    return profile;
}
export function exportProfileSnippet(state = editorState, varName = "myProfile") {
    return exportPipelineJsModule(buildProfileFromEditor(state), varName);
}
function notifyChange(options = {}) {
    onChangeCallback?.(options);
}
function getEditorPanels() {
    return { motifList: document.getElementById("motifList"), motifParams: document.getElementById("motifParamsPanel"), globalParams: document.getElementById("globalParamsPanel") };
}
function refreshEditorPanels(options = {}) {
    const { motifList = true, motifParams = true, global = false } = options;
    const panels = getEditorPanels();
    if (motifList && panels.motifList) renderMotifList(panels.motifList);
    if (motifParams && panels.motifParams) renderMotifParams(panels.motifParams);
    if (global && panels.globalParams) renderGlobalParams(panels.globalParams);
}
function getSelectedMotifIndex() {
    if (!selectedMotifId || !editorState?.motifs.length) return -1;
    return editorState.motifs.findIndex((row) => row.id === selectedMotifId);
}
function getSelectedMotifRow() {
    const index = getSelectedMotifIndex();
    if (index < 0) return null;
    return editorState.motifs[index];
}
function selectMotifById(motifId) {
    selectedMotifId = motifId;
    refreshEditorPanels({ global: false });
}
function renderMotifList(container) {
    if (!editorState) {
        container.innerHTML = "";
        return;
    }
    renderPipelineListUi(container, editorState.motifs, {
        getRowId: pipelineRowId,
        selectedId: selectedMotifId,
        getLabel: (row) => MOTIF_TYPES[row.config.type]?.label ?? row.config.type,
        getMeta: (row) => (isContextMotif(row.config.type) ? "moves below" : surfaceMaskLabel(row.surfaceMask)),
        renderExtras: (row, _index, _item, extrasSlot) => {
            if (isContextMotif(row.config.type)) return;
            const blendSel = document.createElement("select");
            blendSel.className = "motif-row-blend";
            setFormFieldName(blendSel, `${pipelineRowId(row)}_blend`);
            for (const mode of BLEND_OPTIONS) {
                const o = document.createElement("option");
                o.value = String(mode.id);
                o.textContent = mode.label;
                if (mode.id === (row.blendMode ?? BLEND_MODE_ADD)) o.selected = true;
                blendSel.appendChild(o);
            }
            blendSel.addEventListener("change", (e) => {
                row.blendMode = Number(e.target.value);
                notifyChange();
            });
            blendSel.addEventListener("click", (e) => e.stopPropagation());
            extrasSlot.appendChild(blendSel);
        },
        onSelect: selectMotifById,
        onToggleEnabled: (row, _index, enabled) => {
            row.enabled = enabled;
            notifyChange();
            refreshEditorPanels({ motifParams: false, global: false });
        },
        onMoveUp: (index) => {
            if (!movePipelineRow(editorState.motifs, index, -1)) return;
            refreshEditorPanels();
            notifyChange();
        },
        onMoveDown: (index) => {
            if (!movePipelineRow(editorState.motifs, index, 1)) return;
            refreshEditorPanels();
            notifyChange();
        },
        onRemove: (index, row) => {
            editorState.motifs.splice(index, 1);
            if (selectedMotifId === pipelineRowId(row)) selectedMotifId = editorState.motifs[0] ? pipelineRowId(editorState.motifs[0]) : null;
            refreshEditorPanels();
            notifyChange();
        },
    });
}
function renderMotifParams(container) {
    container.innerHTML = "";
    if (!editorState || !selectedMotifId) {
        container.textContent = "Select a motif layer.";
        return;
    }
    const row = editorState.motifs.find((m) => m.id === selectedMotifId);
    if (!row) return;
    const schema = MOTIF_TYPES[row.config.type];
    if (!schema) {
        container.textContent = `No schema for ${row.config.type}`;
        return;
    }
    if (isContextMotif(row.config.type)) {
        const hint = document.createElement("p");
        hint.className = "editor-hint";
        hint.textContent = "Moves every layer below. Set X/Y here.";
        container.appendChild(hint);
    } else {
        const layerSelect = new SelectControl("Surface Mask", LAYER_OPTIONS, row.surfaceMask, (val) => {
            row.surfaceMask = Number(val);
            notifyChange();
            refreshEditorPanels({ motifParams: false, global: false });
        });
        container.appendChild(layerSelect.element);
    }
    renderSchemaFields(
        container,
        row.config,
        schema.fields.filter((field) => field.path !== "blendMode"),
        () => notifyChange(),
    );
}
function renderGlobalParams(container) {
    container.innerHTML = "";
    if (!editorState) return;
    const warpRoot = { warp: editorState.warp };
    const paletteRoot = { palette: editorState.palette };
    appendEditorSubhead(container, "Warp", { tag: "h4" });
    renderSchemaFields(container, warpRoot, WARP_FIELDS, () => notifyChange());
    editorState.warp = warpRoot.warp;
    appendEditorSubhead(container, "Palette", { tag: "h4" });
    renderSchemaFields(container, paletteRoot, PALETTE_FIELDS, () => notifyChange());
    editorState.palette = paletteRoot.palette;
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
        if (!schema || !editorState) return;
        const row = { id: `m${nextMotifId++}`, enabled: true, surfaceMask: SURFACE_MASK_ALL, blendMode: BLEND_MODE_ADD, config: deepClone(schema.defaults) };
        editorState.motifs.push(row);
        selectMotifById(row.id);
        notifyChange();
    });
    loadBtn.addEventListener("click", () => {
        const selectedId = presetSelect.value;
        loadEditorFromProfileId(selectedId, { silent: true });
        refreshEditorPanels({ global: true });
        exportArea.value = exportProfileSnippet();
        notifyChange({ reloadProfile: true });
    });
    copyExportBtn.addEventListener("click", async () => {
        exportArea.value = exportProfileSnippet();
        await navigator.clipboard.writeText(exportArea.value);
    });
    onChangeCallback = (options) => {
        if (exportArea) exportArea.value = exportProfileSnippet();
        onChange?.(options);
    };
    const initialId = presetSelect?.value || "cyberGrid";
    loadEditorFromProfileId(initialId, { silent: true });
    refreshEditorPanels({ global: true });
    exportArea.value = exportProfileSnippet();
}
