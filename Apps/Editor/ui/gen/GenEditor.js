import { deepClone } from "../../../../Libraries/Pipeline/objectPath.js";
import { createPipelineRow, movePipelineRow, pipelineRowId } from "../../../../Libraries/Pipeline/index.js";
import { stepId } from "../../../../Libraries/Pipeline/stepRegistry.js";
import { DEFAULT_SANDBOX_GRAPH_MOTIFS, dropStaleBuildNodeGraphTreeEdges } from "../../../../Libraries/Sandbox/sandboxRoomGraphGen.js";
import { ROOM_GRAPH_STEP_REGISTRY, validateRoomGraphMotifs } from "../../../../Libraries/Sandbox/roomGraphStepRegistry.js";
import { renderPipelineListUi } from "../../../../Libraries/UI/pipelineListUi.js";
import { renderSchemaFields } from "../../../../Libraries/UI/renderSchemaFields.js";
import { appendEditorHint, appendEditorSubhead } from "../../../../Libraries/UI/paramFields.js";
import { SliderControl } from "../../../../Libraries/UI/controls/SliderControl.js";
import { SelectControl } from "../../../../Libraries/UI/controls/SelectControl.js";
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
/** @param {GenEditorState} state */
function buildGraphSceneOptions(state) {
    return { seed: state.seed, motifs: buildMotifsFromGenEditor(state) };
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
/** @param {{ list?: boolean, params?: boolean }} [options] */
function notifyGenChange(options = {}) {
    syncValidationStatus();
    const { list = true, params = true } = options;
    if (list) renderGenBodyList();
    if (params) renderGenStepParams();
}
function selectStepById(stepIdValue) {
    selectedStepId = stepIdValue;
    notifyGenChange({ list: true, params: true });
}
function findSelectedBodyRow() {
    return editorState.bodyRows.find((row) => pipelineRowId(row) === selectedStepId) ?? null;
}
function renderGenTools(container) {
    container.innerHTML = "";
    appendEditorHint(container, "Generate a procedural room graph into the sandbox. Edit pipeline body steps below.");
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
        setStatusMessage(`Generated graph (seed ${editorState.seed}).`, "ok");
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
        },
        (value) => String(value >>> 0),
    );
    container.appendChild(seedSlider.element);
    syncValidationStatus();
}
function renderGenRetry(container) {
    container.innerHTML = "";
    appendEditorHint(container, "Outer retryUntil wrapper — max attempts here; until criteria stay on the default validateLayout step.");
    const retrySlider = new SliderControl("Max attempts", 1, 500, 1, editorState.maxAttempts, (value) => {
        editorState.maxAttempts = value;
        notifyGenChange({ list: false, params: false });
    });
    container.appendChild(retrySlider.element);
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
    if (childDef?.fields?.length) renderSchemaFields(container, /** @type {Record<string, unknown>} */ (row.config[slot.name]), childDef.fields, () => notifyGenChange({ list: false }));
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
    if (def.fields?.length) {
        const onFieldChange = () => {
            if (stepId(row.config) === "buildNodeGraph") dropStaleBuildNodeGraphTreeEdges(row.config);
            notifyGenChange({ list: false });
        };
        renderSchemaFields(container, row.config, def.fields, onFieldChange);
    }
    if (stepId(row.config) === "buildNodeGraph" && row.config.placement === "treeSpread" && !row.config.treeEdges)
        appendEditorHint(container, "Tree shape randomizes each attempt when no custom treeEdges are set.");
    for (const slot of def.slots ?? []) renderGenStepSlot(container, row, slot);
}
function refreshGenPanels() {
    renderGenTools(document.getElementById("genToolsPanel"));
    renderGenRetry(document.getElementById("genRetryPanel"));
    renderGenBodyTools(document.getElementById("genBodyTools"));
    renderGenBodyList();
    renderGenStepParams();
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
    refreshGenPanels();
}
