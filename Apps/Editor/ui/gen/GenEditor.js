import { deepClone } from "../../../../Libraries/Pipeline/objectPath.js";
import { DEFAULT_SANDBOX_GRAPH_MOTIFS } from "../../../../Libraries/Sandbox/sandboxRoomGraphGen.js";
import { validateRoomGraphMotifs } from "../../../../Libraries/Sandbox/roomGraphStepRegistry.js";
import { appendEditorHint } from "../../../../Libraries/UI/paramFields.js";
import { SliderControl } from "../../../../Libraries/UI/controls/SliderControl.js";
/** @typedef {{ seed: number, maxAttempts: number, until: Record<string, unknown>, body: Record<string, unknown>[] }} GenEditorState */
/** @type {GenEditorState | null} */
let editorState = null;
/** @type {ReturnType<import("../../../../Libraries/Sandbox/createSandboxController.js").createSandboxController> | null} */
let sandboxController = null;
/** @type {(() => void) | null} */
let onChangeCallback = null;
/** @param {unknown} root */
function parseRetryUntilMotifs(root) {
    const motif = /** @type {{ op?: string, maxAttempts?: number, until?: Record<string, unknown>, body?: Record<string, unknown>[] }} */ (root);
    if (motif.op !== "retryUntil") throw new Error("Gen editor expects a single top-level retryUntil motif");
    return { maxAttempts: motif.maxAttempts ?? 60, until: deepClone(motif.until), body: deepClone(motif.body) };
}
/** @returns {GenEditorState} */
function createDefaultGenEditorState() {
    const retry = parseRetryUntilMotifs(DEFAULT_SANDBOX_GRAPH_MOTIFS[0]);
    return { seed: Date.now() >>> 0, ...retry };
}
/** @param {GenEditorState} state */
export function buildMotifsFromGenEditor(state) {
    return [{ op: "retryUntil", maxAttempts: state.maxAttempts, body: state.body, until: state.until }];
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
function renderGenTools(container) {
    container.innerHTML = "";
    appendEditorHint(container, "Generate a procedural room graph into the sandbox. Seed changes layout; pipeline body edits land in Phase 2.");
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.textContent = "Generate graph";
    generateBtn.addEventListener("click", () => {
        if (!editorState || !sandboxController) return;
        if (!window.confirm("Replace the sandbox with a generated room graph?")) return;
        const validation = validateRoomGraphMotifs(buildMotifsFromGenEditor(editorState));
        if (!validation.ok) {
            setStatusMessage(formatValidationErrors(validation.errors), "error");
            return;
        }
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
        setStatusMessage(`Seed set to ${editorState.seed}.`, "idle");
    });
    row.appendChild(randomSeedBtn);
    container.appendChild(row);
    const seed = editorState.seed;
    const seedSlider = new SliderControl(
        "Seed",
        0,
        0xffffffff,
        1,
        seed,
        (value) => {
            editorState.seed = value >>> 0;
        },
        (value) => String(value >>> 0),
    );
    container.appendChild(seedSlider.element);
}
function renderGenRetry(container) {
    container.innerHTML = "";
    appendEditorHint(container, "Outer retryUntil wrapper — edit max attempts here; until criteria stay on the default validateLayout step.");
    const maxAttempts = editorState.maxAttempts;
    const retrySlider = new SliderControl("Max attempts", 1, 500, 1, maxAttempts, (value) => {
        editorState.maxAttempts = value;
    });
    container.appendChild(retrySlider.element);
}
function renderGenBodySummary(container) {
    container.innerHTML = "";
    const steps = editorState.body;
    appendEditorHint(container, `${steps.length} pipeline steps inside the retry body. Step list editing arrives in Phase 2.`);
    const list = document.createElement("ol");
    list.className = "gen-body-summary";
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const item = document.createElement("li");
        item.textContent = typeof step.op === "string" ? step.op : "unknown step";
        list.appendChild(item);
    }
    container.appendChild(list);
}
function refreshGenPanels() {
    const tools = document.getElementById("genToolsPanel");
    const retry = document.getElementById("genRetryPanel");
    const body = document.getElementById("genBodyPanel");
    if (tools) renderGenTools(tools);
    if (retry) renderGenRetry(retry);
    if (body) renderGenBodySummary(body);
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
    refreshGenPanels();
    setStatusMessage("Ready.", "idle");
}
