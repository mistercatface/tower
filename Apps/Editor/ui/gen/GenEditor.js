import { deepClone } from "../../../../Libraries/Pipeline/objectPath.js";
import { createPipelineRow, movePipelineRow, pipelineRowId } from "../../../../Libraries/Pipeline/index.js";
import { exportPipelineJson, exportPipelineJsModule } from "../../../../Libraries/Pipeline/exportPipeline.js";
import { stepId } from "../../../../Libraries/Pipeline/stepRegistry.js";
import { DEFAULT_SANDBOX_GRAPH_MOTIFS, dropStaleBuildNodeGraphTreeEdges } from "../../../../Libraries/Sandbox/sandboxRoomGraphGen.js";
import { ROOM_GRAPH_STEP_REGISTRY, validateRoomGraphMotifs } from "../../../../Libraries/Sandbox/roomGraphStepRegistry.js";
import { renderPipelineListUi } from "../../../../Libraries/UI/pipelineListUi.js";
import { renderSchemaFields } from "../../../../Libraries/UI/renderSchemaFields.js";
import { appendEditorHint, appendEditorSubhead } from "../../../../Libraries/UI/paramFields.js";
import { SliderControl } from "../../../../Libraries/UI/controls/SliderControl.js";
import { SelectControl } from "../../../../Libraries/UI/controls/SelectControl.js";
const GEN_PRESETS_STORAGE_KEY = "tilelab.genPresets.v1";
const DEFAULT_PRESET_ID = "default";
/** @typedef {{ seed: number, maxAttempts: number, until: Record<string, unknown>, bodyRows: import("../../../../Libraries/Pipeline/pipelineList.js").PipelineEditorRow[] }} GenEditorState */
/** @type {GenEditorState | null} */
let editorState = null;
/** @type {ReturnType<import("../../../../Libraries/Sandbox/createSandboxController.js").createSandboxController> | null} */
let sandboxController = null;
/** @type {(() => void) | null} */
let onChangeCallback = null;
/** @type {string | null} */
let selectedStepId = null;
/** @type {number} */
let nextStepId = 1;
/** @type {HTMLButtonElement | null} */
let generateBtnRef = null;
/** @type {string} */
let selectedPresetId = DEFAULT_PRESET_ID;
const BODY_ADDABLE_STEPS = ROOM_GRAPH_STEP_REGISTRY.list()
    .map((def) => def.id)
    .filter((id) => id !== "retryUntil");
/** @param {unknown} root */
function parseRetryUntilMotifs(root) {
    const motif = /** @type {{ op?: string, maxAttempts?: number, until?: Record<string, unknown>, body?: Record<string, unknown>[] }} */ (root);
    if (motif.op !== "retryUntil") throw new Error("Gen editor expects a single top-level retryUntil motif");
    return { maxAttempts: motif.maxAttempts ?? 60, until: deepClone(motif.until), body: deepClone(motif.body) };
}
/** @param {Record<string, unknown>[]} configs */
function configsToBodyRows(configs) {
    return configs.map((config) => createPipelineRow(deepClone(config), `s${nextStepId++}`));
}
/** @returns {GenEditorState} */
function createDefaultGenEditorState() {
    nextStepId = 1;
    const retry = parseRetryUntilMotifs(DEFAULT_SANDBOX_GRAPH_MOTIFS[0]);
    const bodyRows = configsToBodyRows(retry.body);
    return { seed: Date.now() >>> 0, maxAttempts: retry.maxAttempts, until: retry.until, bodyRows };
}
/** @param {GenEditorState} state */
export function buildMotifsFromGenEditor(state) {
    return [{ op: "retryUntil", maxAttempts: state.maxAttempts, body: state.bodyRows.map((row) => row.config), until: state.until }];
}
/** @param {GenEditorState} [state] */
export function exportGenMotifsJson(state = editorState) {
    return exportPipelineJson(buildMotifsFromGenEditor(state));
}
/** @param {GenEditorState} [state] */
export function exportGenMotifsJsModule(state = editorState) {
    return exportPipelineJsModule(buildMotifsFromGenEditor(state), "SANDBOX_GRAPH_MOTIFS");
}
/** @param {GenEditorState} state */
function buildGraphSceneOptions(state) {
    return { seed: state.seed, motifs: buildMotifsFromGenEditor(state) };
}
/** @returns {Record<string, { seed?: number, maxAttempts?: number, until?: Record<string, unknown>, body?: Record<string, unknown>[] }>} */
function readGenPresets() {
    const raw = localStorage.getItem(GEN_PRESETS_STORAGE_KEY);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return /** @type {Record<string, { seed?: number, maxAttempts?: number, until?: Record<string, unknown>, body?: Record<string, unknown>[] }>} */ (parsed);
    } catch {
        return {};
    }
}
/** @param {Record<string, unknown>} presets */
function writeGenPresets(presets) {
    localStorage.setItem(GEN_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}
function snapshotEditorState() {
    return { seed: editorState.seed, maxAttempts: editorState.maxAttempts, until: deepClone(editorState.until), body: editorState.bodyRows.map((row) => deepClone(row.config)) };
}
/** @param {{ seed?: number, maxAttempts?: number, until?: Record<string, unknown>, body?: Record<string, unknown>[] }} snapshot */
function applyEditorSnapshot(snapshot) {
    nextStepId = 1;
    editorState.seed = snapshot.seed ?? Date.now() >>> 0;
    editorState.maxAttempts = snapshot.maxAttempts ?? 60;
    editorState.until = deepClone(snapshot.until ?? ROOM_GRAPH_STEP_REGISTRY.get("validateLayout").defaults);
    editorState.bodyRows = configsToBodyRows(snapshot.body ?? []);
    selectedStepId = editorState.bodyRows[0] ? pipelineRowId(editorState.bodyRows[0]) : null;
    refreshGenPanels();
}
function loadDefaultPreset() {
    editorState = createDefaultGenEditorState();
    selectedStepId = editorState.bodyRows[0] ? pipelineRowId(editorState.bodyRows[0]) : null;
    selectedPresetId = DEFAULT_PRESET_ID;
    refreshGenPanels();
}
/** @param {string} presetId */
function loadGenPreset(presetId) {
    if (presetId === DEFAULT_PRESET_ID) {
        loadDefaultPreset();
        return;
    }
    const presets = readGenPresets();
    const snapshot = presets[presetId];
    if (!snapshot) throw new Error(`Unknown preset: ${presetId}`);
    applyEditorSnapshot(snapshot);
    selectedPresetId = presetId;
    syncGenExport();
}
function saveCurrentGenPreset() {
    const name = window.prompt("Preset name");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const presets = readGenPresets();
    presets[trimmed] = snapshotEditorState();
    writeGenPresets(presets);
    selectedPresetId = trimmed;
    renderGenPresetTools(document.getElementById("genPresetTools"));
}
/** @param {string} message @param {"error" | "ok" | "idle"} [kind] */
function setStatusMessage(message, kind = "idle") {
    const panel = document.getElementById("genStatusPanel");
    if (!panel) return;
    panel.textContent = message;
    panel.dataset.status = kind;
}
/** @param {import("../../../../Libraries/Pipeline/validatePipeline.js").PipelineValidationError[]} errors */
function formatValidationErrors(errors) {
    return errors.map((err) => (err.path ? `${err.path}: ${err.message}` : err.message)).join("\n");
}
/** @param {{ meta?: { seed?: number, rooms?: unknown[], corridors?: unknown[], edges?: unknown[] }, cols?: number, rows?: number }} doc */
function formatBuildStats(doc) {
    const meta = doc.meta;
    const rooms = meta?.rooms?.length ?? 0;
    const corridors = meta?.corridors?.length ?? 0;
    const edges = meta?.edges?.length ?? 0;
    const seed = meta?.seed ?? "?";
    const cols = doc.cols ?? "?";
    const rows = doc.rows ?? "?";
    return `Generated ${rooms} rooms, ${corridors} corridors (${edges} graph edges), seed ${seed}. Grid ${cols}×${rows}.`;
}
function currentValidation() {
    for (const row of editorState.bodyRows) if (stepId(row.config) === "buildNodeGraph") dropStaleBuildNodeGraphTreeEdges(row.config);
    return validateRoomGraphMotifs(buildMotifsFromGenEditor(editorState));
}
function syncValidationStatus() {
    const validation = currentValidation();
    if (validation.ok) setStatusMessage("Pipeline valid.", "idle");
    else setStatusMessage(formatValidationErrors(validation.errors), "error");
    if (generateBtnRef) generateBtnRef.disabled = !validation.ok;
    return validation;
}
/** Lightweight update — keep param sliders mounted while dragging. */
function onGenFieldChange(row) {
    if (row && stepId(row.config) === "buildNodeGraph") dropStaleBuildNodeGraphTreeEdges(row.config);
    syncValidationStatus();
    syncGenExport();
}
function syncGenExport() {
    const exportArea = document.getElementById("genExport");
    if (exportArea) exportArea.value = exportGenMotifsJson();
}
/** @param {{ list?: boolean, params?: boolean, export?: boolean }} [options] */
function notifyGenChange(options = {}) {
    syncValidationStatus();
    const { list = true, params = true, export: syncExport = true } = options;
    if (list) renderGenBodyList();
    if (params) renderGenStepParams();
    if (syncExport) syncGenExport();
}
function selectStepById(stepIdValue) {
    selectedStepId = stepIdValue;
    notifyGenChange({ list: true, params: true });
}
function findSelectedBodyRow() {
    return editorState.bodyRows.find((row) => pipelineRowId(row) === selectedStepId) ?? null;
}
function viewSceneJson() {
    const json = sandboxController.exportSceneSnapshot();
    const jsonTab = document.querySelector('input[name="editorSidebarPanel"][value="json"]');
    if (jsonTab) {
        /** @type {HTMLInputElement} */ (jsonTab).checked = true;
        jsonTab.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const textarea = document.querySelector("#sceneJsonPanel textarea");
    if (textarea) /** @type {HTMLTextAreaElement} */ (textarea).value = json;
}
function renderGenPresetTools(container) {
    if (!container) return;
    container.innerHTML = "";
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const presetSelect = document.createElement("select");
    presetSelect.id = "genPresetSelect";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = DEFAULT_PRESET_ID;
    defaultOpt.textContent = "Default (shipped)";
    presetSelect.appendChild(defaultOpt);
    const presets = readGenPresets();
    for (const name of Object.keys(presets).sort()) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        presetSelect.appendChild(opt);
    }
    presetSelect.value = selectedPresetId in presets || selectedPresetId === DEFAULT_PRESET_ID ? selectedPresetId : DEFAULT_PRESET_ID;
    row.appendChild(presetSelect);
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load";
    loadBtn.addEventListener("click", () => {
        try {
            loadGenPreset(presetSelect.value);
        } catch (err) {
            setStatusMessage(err instanceof Error ? err.message : String(err), "error");
        }
    });
    row.appendChild(loadBtn);
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "secondary";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => saveCurrentGenPreset());
    row.appendChild(saveBtn);
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "secondary";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => {
        if (!window.confirm("Reset pipeline to the shipped default?")) return;
        loadDefaultPreset();
    });
    row.appendChild(resetBtn);
    container.appendChild(row);
}
function renderGenExportTools(container) {
    if (!container) return;
    container.innerHTML = "";
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const copyJsonBtn = document.createElement("button");
    copyJsonBtn.type = "button";
    copyJsonBtn.className = "secondary";
    copyJsonBtn.textContent = "Copy JSON";
    copyJsonBtn.addEventListener("click", async () => {
        syncGenExport();
        const exportArea = document.getElementById("genExport");
        const text = exportArea?.value || exportGenMotifsJson();
        await navigator.clipboard.writeText(text);
    });
    row.appendChild(copyJsonBtn);
    const copyJsBtn = document.createElement("button");
    copyJsBtn.type = "button";
    copyJsBtn.className = "secondary";
    copyJsBtn.textContent = "Copy JS module";
    copyJsBtn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(exportGenMotifsJsModule());
    });
    row.appendChild(copyJsBtn);
    const viewJsonBtn = document.createElement("button");
    viewJsonBtn.type = "button";
    viewJsonBtn.className = "secondary";
    viewJsonBtn.textContent = "View scene JSON";
    viewJsonBtn.addEventListener("click", () => viewSceneJson());
    row.appendChild(viewJsonBtn);
    container.appendChild(row);
}
function renderGenTools(container) {
    container.innerHTML = "";
    appendEditorHint(container, "Generate a procedural room graph into the sandbox.");
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.textContent = "Generate graph";
    generateBtnRef = generateBtn;
    generateBtn.addEventListener("click", () => {
        if (!editorState || !sandboxController) return;
        const validation = currentValidation();
        if (!validation.ok) {
            setStatusMessage(formatValidationErrors(validation.errors), "error");
            return;
        }
        if (!window.confirm("Replace the sandbox with a generated room graph?")) return;
        const result = sandboxController.tryLoadGraphScene(buildGraphSceneOptions(editorState));
        if (!result.ok) {
            setStatusMessage(result.reason, "error");
            return;
        }
        setStatusMessage(formatBuildStats(result.doc), "ok");
        onChangeCallback?.();
    });
    row.appendChild(generateBtn);
    const randomSeedBtn = document.createElement("button");
    randomSeedBtn.type = "button";
    randomSeedBtn.className = "secondary";
    randomSeedBtn.textContent = "Random seed";
    randomSeedBtn.addEventListener("click", () => {
        if (!editorState) return;
        editorState.seed = Date.now() >>> 0;
        renderGenTools(container);
        renderGenRetry(document.getElementById("genRetryPanel"));
        syncValidationStatus();
        syncGenExport();
    });
    row.appendChild(randomSeedBtn);
    container.appendChild(row);
    const seedSlider = new SliderControl(
        "Seed",
        0,
        0xffffffff,
        1,
        editorState.seed,
        (value) => {
            editorState.seed = value >>> 0;
            syncGenExport();
        },
        (value) => String(value >>> 0),
    );
    container.appendChild(seedSlider.element);
    syncValidationStatus();
}
function renderGenRetry(container) {
    container.innerHTML = "";
    appendEditorHint(container, "Outer retryUntil — max attempts before the whole pipeline gives up.");
    const retrySlider = new SliderControl("Max attempts", 1, 500, 1, editorState.maxAttempts, (value) => {
        editorState.maxAttempts = value;
        notifyGenChange({ list: false, params: false });
    });
    container.appendChild(retrySlider.element);
}
function renderGenUntil(container) {
    container.innerHTML = "";
    appendEditorSubhead(container, "Until (pass condition)", { tag: "h4" });
    appendEditorHint(container, "Checked after each attempt succeeds without throwing. validateLayout steps in the pipeline body can still fail fast mid-run.");
    if (stepId(editorState.until) !== "validateLayout") {
        appendEditorHint(container, "Until step is not validateLayout — edit via Export JSON.");
        return;
    }
    const def = ROOM_GRAPH_STEP_REGISTRY.get("validateLayout");
    renderSchemaFields(container, editorState.until, def.fields, () => onGenFieldChange(null));
}
function renderGenBodyTools(container) {
    container.innerHTML = "";
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const addSelect = document.createElement("select");
    for (const op of BODY_ADDABLE_STEPS) {
        const opt = document.createElement("option");
        opt.value = op;
        opt.textContent = ROOM_GRAPH_STEP_REGISTRY.get(op)?.label ?? op;
        addSelect.appendChild(opt);
    }
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary";
    addBtn.textContent = "+ Step";
    addBtn.addEventListener("click", () => {
        const op = addSelect.value;
        const def = ROOM_GRAPH_STEP_REGISTRY.get(op);
        const rowData = createPipelineRow(deepClone(def.defaults), `s${nextStepId++}`);
        editorState.bodyRows.push(rowData);
        selectStepById(pipelineRowId(rowData));
    });
    row.appendChild(addSelect);
    row.appendChild(addBtn);
    container.appendChild(row);
}
function renderGenBodyList() {
    const listHost = document.getElementById("genStepList");
    if (!listHost) return;
    renderPipelineListUi(listHost, editorState.bodyRows, {
        showEnableToggle: false,
        getRowId: pipelineRowId,
        selectedId: selectedStepId,
        rowClass: "motif-row",
        getLabel: (row) => ROOM_GRAPH_STEP_REGISTRY.get(stepId(row.config) ?? "")?.label ?? stepId(row.config) ?? "unknown",
        getMeta: (row) => stepId(row.config),
        onSelect: selectStepById,
        onMoveUp: (index) => {
            if (!movePipelineRow(editorState.bodyRows, index, -1)) return;
            notifyGenChange();
        },
        onMoveDown: (index) => {
            if (!movePipelineRow(editorState.bodyRows, index, 1)) return;
            notifyGenChange();
        },
        onRemove: (index, row) => {
            editorState.bodyRows.splice(index, 1);
            if (pipelineRowId(row) === selectedStepId) selectedStepId = editorState.bodyRows[0] ? pipelineRowId(editorState.bodyRows[0]) : null;
            notifyGenChange();
        },
    });
}
/** @param {HTMLElement} container @param {import("../../../../Libraries/Pipeline/pipelineList.js").PipelineEditorRow} row @param {{ name: string, allowedSteps?: string[], required?: boolean, array?: boolean }} slot */
function renderGenStepSlot(container, row, slot) {
    if (slot.array) return;
    const child = row.config[slot.name];
    if (child == null || typeof child !== "object" || Array.isArray(child)) return;
    const childConfig = /** @type {Record<string, unknown>} */ (child);
    appendEditorSubhead(container, slot.name === "run" ? "Run step" : slot.name, { tag: "h4" });
    if (slot.allowedSteps?.length) {
        const currentOp = stepId(childConfig) ?? slot.allowedSteps[0];
        const options = slot.allowedSteps.map((op) => ({ value: op, label: ROOM_GRAPH_STEP_REGISTRY.get(op)?.label ?? op }));
        const typeSelect = new SelectControl("Step type", options, currentOp, (val) => {
            row.config[slot.name] = deepClone(ROOM_GRAPH_STEP_REGISTRY.get(val).defaults);
            notifyGenChange({ list: false });
        });
        container.appendChild(typeSelect.element);
    }
    const childDef = ROOM_GRAPH_STEP_REGISTRY.get(stepId(childConfig) ?? "");
    if (childDef?.fields?.length) renderSchemaFields(container, /** @type {Record<string, unknown>} */ (row.config[slot.name]), childDef.fields, () => onGenFieldChange(row));
}
function renderGenStepParams() {
    const container = document.getElementById("genStepParamsPanel");
    if (!container) return;
    container.innerHTML = "";
    const row = findSelectedBodyRow();
    if (!row) {
        container.textContent = editorState.bodyRows.length === 0 ? "Add a pipeline step." : "Select a pipeline step.";
        return;
    }
    const def = ROOM_GRAPH_STEP_REGISTRY.get(stepId(row.config) ?? "");
    if (!def) {
        container.textContent = `No schema for ${stepId(row.config) ?? "unknown step"}.`;
        return;
    }
    if (def.fields?.length) renderSchemaFields(container, row.config, def.fields, () => onGenFieldChange(row));
    if (stepId(row.config) === "buildNodeGraph" && row.config.placement === "treeSpread" && !row.config.treeEdges)
        appendEditorHint(container, "Tree shape randomizes each attempt when no custom treeEdges are set.");
    for (const slot of def.slots ?? []) renderGenStepSlot(container, row, slot);
}
function refreshGenPanels() {
    renderGenPresetTools(document.getElementById("genPresetTools"));
    renderGenTools(document.getElementById("genToolsPanel"));
    renderGenRetry(document.getElementById("genRetryPanel"));
    renderGenUntil(document.getElementById("genUntilPanel"));
    renderGenBodyTools(document.getElementById("genBodyTools"));
    renderGenBodyList();
    renderGenStepParams();
    renderGenExportTools(document.getElementById("genExportTools"));
    syncGenExport();
}
/**
 * @param {{
 *   controller: ReturnType<import("../../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>,
 *   onChange?: () => void,
 * }} options
 */
export function initGenEditor({ controller, onChange }) {
    sandboxController = controller;
    onChangeCallback = onChange ?? null;
    editorState = createDefaultGenEditorState();
    selectedStepId = editorState.bodyRows[0] ? pipelineRowId(editorState.bodyRows[0]) : null;
    selectedPresetId = DEFAULT_PRESET_ID;
    refreshGenPanels();
}
