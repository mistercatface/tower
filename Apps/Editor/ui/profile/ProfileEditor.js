import { getSurfaceProceduralProfile } from "../../../../Config/procedural/profiles.js";
import { exportPipelineJsModule } from "../../../../Libraries/Pipeline/exportPipeline.js";
import { deepClone, getByPath, movePipelineRow, pipelineRowId, remapIndexAfterSwap } from "../../../../Libraries/Pipeline/index.js";
import { SelectControl } from "../../../../Libraries/UI/controls/SelectControl.js";
import { renderPipelineListUi } from "../../../../Libraries/UI/pipelineListUi.js";
import { renderSchemaFields } from "../../../../Libraries/UI/renderSchemaFields.js";
import { appendEditorSubhead } from "../../../../Libraries/UI/paramFields.js";
import { mirrorEasingForReversedStage } from "../../../../Libraries/Math/Easing.js";
import { BLEND_OPTIONS, EASING_OPTIONS, LAYER_OPTIONS, MOTIF_TYPES, PALETTE_FIELDS, WARP_FIELDS, getAnimatableMotifFields, isContextMotif } from "./profileSchema.js";
export const RUNTIME_LAB_PROFILE_ID = "__labA__";
let editorState = null;
let selectedMotifId = null;
let onChangeCallback = null;
let nextMotifId = 1;
function defaultAnimation() {
    return {
        enabled: false,
        selectedStageIndex: 0,
        selectedTrackIndex: 0,
        stages: [{ frames: 30, durationMs: 2000 }],
        tracks: [{ editorMotifIndex: 0, paramPath: "hueShift", stages: [{ startValue: 0, endValue: 360, easing: "linear" }] }],
    };
}
function parseAnimationTargetPath(targetPath) {
    const match = /^motifs\[(\d+)\]\.(.+)$/.exec(targetPath ?? "");
    if (!match) return null;
    return { exportIndex: Number(match[1]), paramPath: match[2] };
}
function editorMotifIndexFromExportIndex(motifs, exportIndex) {
    let idx = 0;
    for (let i = 0; i < motifs.length; i++) {
        if (!motifs[i].enabled) continue;
        if (idx === exportIndex) return i;
        idx++;
    }
    return motifs.findIndex((row) => row.enabled);
}
function motifExportIndex(motifs, editorMotifIndex) {
    let idx = 0;
    for (let i = 0; i < motifs.length; i++) {
        if (!motifs[i].enabled) continue;
        if (i === editorMotifIndex) return idx;
        idx++;
    }
    return 0;
}
function animationFromProfile(profile, motifs) {
    const anim = profile.animation;
    if (!anim || !anim.stages || !Array.isArray(anim.stages)) return defaultAnimation();
    const stages = [];
    for (const stage of anim.stages) stages.push({ durationMs: stage.durationMs ?? 2000, frames: stage.frames ?? 30 });
    const targetPaths = [];
    for (const stage of anim.stages) if (stage.tracks) for (const t of stage.tracks) if (t.targetPath && !targetPaths.includes(t.targetPath)) targetPaths.push(t.targetPath);
    if (targetPaths.length === 0) targetPaths.push("motifs[0].hueShift");
    const tracks = [];
    for (const path of targetPaths) {
        const parsed = parseAnimationTargetPath(path);
        const editorMotifIndex = parsed ? editorMotifIndexFromExportIndex(motifs, parsed.exportIndex) : 0;
        const paramPath = parsed?.paramPath ?? "hueShift";
        const trackStages = [];
        for (let i = 0; i < anim.stages.length; i++) {
            const stage = anim.stages[i];
            const stageTrack = stage.tracks?.find((t) => t.targetPath === path);
            trackStages.push({ startValue: stageTrack?.startValue ?? 0, endValue: stageTrack?.endValue ?? 360, easing: stageTrack?.easing ?? "linear" });
        }
        tracks.push({ editorMotifIndex: Math.max(0, editorMotifIndex), paramPath, stages: trackStages });
    }
    return { enabled: false, selectedStageIndex: 0, selectedTrackIndex: 0, stages, tracks };
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
        const blendMode = config.blendMode ?? "add";
        delete config.blendMode;
        delete config.opacity;
        rows.push({ id: `m${nextMotifId++}`, enabled: motif.enabled !== false, surfaceMask: motif.surfaceMask ?? "all", blendMode, config });
    }
    return rows;
}
function loadEditorFromProfileId(profileId, { silent = false } = {}) {
    nextMotifId = 1;
    const profile = deepClone(getSurfaceProceduralProfile(profileId));
    const motifs = motifsFromProfile(profile);
    editorState = { warp: profile.warp ?? defaultWarp(), palette: { ...defaultPalette(), ...profile.palette }, motifs, animation: animationFromProfile(profile, motifs) };
    editorState.animation.selectedTrackIndex = 0;
    for (const track of editorState.animation.tracks) if (track.editorMotifIndex >= editorState.motifs.length) track.editorMotifIndex = 0;
    const activeTrack = editorState.animation.tracks[0];
    const animRow = editorState.motifs[activeTrack?.editorMotifIndex ?? 0];
    if (editorState.animation.enabled && animRow) selectedMotifId = animRow.id;
    else selectedMotifId = editorState.motifs[0]?.id ?? null;
    if (!silent) notifyChange({ lightweight: true });
    return editorState;
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
            config.blendMode = row.blendMode ?? "add";
        }
        profile.motifs.push(config);
    }
    if (state.animation?.enabled) {
        const stages = [];
        for (let i = 0; i < state.animation.stages.length; i++) {
            const stageConfig = state.animation.stages[i];
            const tracks = [];
            for (const track of state.animation.tracks) {
                const exportIdx = motifExportIndex(state.motifs, track.editorMotifIndex);
                const stageTrackData = track.stages[i] || { startValue: 0, endValue: 360, easing: "linear" };
                tracks.push({
                    targetPath: `motifs[${exportIdx}].${track.paramPath}`,
                    startValue: stageTrackData.startValue,
                    endValue: stageTrackData.endValue,
                    easing: stageTrackData.easing ?? "linear",
                });
            }
            stages.push({ frames: Math.max(2, Math.round(stageConfig.frames)), durationMs: Math.max(100, Math.round(stageConfig.durationMs)), tracks });
        }
        profile.animation = { stages };
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
    return {
        motifList: document.getElementById("motifList"),
        motifParams: document.getElementById("motifParamsPanel"),
        animationParams: document.getElementById("animationParamsPanel"),
        globalParams: document.getElementById("globalParamsPanel"),
    };
}
function refreshEditorPanels(options = {}) {
    const { motifList = true, motifParams = true, animation = true, global = false } = options;
    const panels = getEditorPanels();
    if (motifList && panels.motifList) renderMotifList(panels.motifList);
    if (motifParams && panels.motifParams) renderMotifParams(panels.motifParams);
    if (animation && panels.animationParams) renderAnimationParams(panels.animationParams);
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
function syncAnimationParamRange(trackIndex = editorState?.animation?.selectedTrackIndex ?? 0) {
    if (!editorState?.animation) return;
    const tracks = editorState.animation.tracks;
    if (trackIndex < 0 || trackIndex >= tracks.length) return;
    const track = tracks[trackIndex];
    const motifIndex = track.editorMotifIndex;
    if (motifIndex < 0 || motifIndex >= editorState.motifs.length) return;
    const row = editorState.motifs[motifIndex];
    const fields = getAnimatableMotifFields(row?.config);
    if (fields.length === 0) return;
    if (!fields.some((field) => field.path === track.paramPath)) track.paramPath = fields[0].path;
    const field = fields.find((f) => f.path === track.paramPath) ?? fields[0];
    const current = Number(getByPath(row.config, field.path) ?? field.min ?? 0);
    const min = field.min ?? 0;
    const max = field.max ?? current + 180;
    if (!track.stages) track.stages = [];
    while (track.stages.length < editorState.animation.stages.length) track.stages.push({ startValue: current, endValue: max, easing: "linear" });
    const activeStageIndex = editorState.animation.selectedStageIndex;
    const stageData = track.stages[activeStageIndex];
    stageData.startValue = stageData.startValue ?? current;
    let end = stageData.endValue;
    if (!Number.isFinite(end) || end <= min || end > max || end === current) end = max;
    stageData.endValue = end;
    stageData.easing = stageData.easing ?? "linear";
}
function selectMotifById(motifId) {
    selectedMotifId = motifId;
    refreshEditorPanels({ global: false });
}
function remapProfileAnimationIndices(remap) {
    if (!editorState?.animation?.tracks) return;
    for (const track of editorState.animation.tracks) track.editorMotifIndex = remap(track.editorMotifIndex);
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
        getMeta: (row) => (isContextMotif(row.config.type) ? "moves below" : row.surfaceMask),
        renderExtras: (row, _index, _item, extrasSlot) => {
            if (isContextMotif(row.config.type)) return;
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
                row.blendMode = /** @type {HTMLSelectElement} */ (e.target).value;
                notifyChange();
            });
            blendSel.addEventListener("click", (e) => e.stopPropagation());
            extrasSlot.appendChild(blendSel);
        },
        onSelect: selectMotifById,
        onToggleEnabled: (row, _index, enabled) => {
            row.enabled = enabled;
            notifyChange();
            refreshEditorPanels({ motifParams: false, animation: true, global: false });
        },
        onMoveUp: (index) => {
            if (!movePipelineRow(editorState.motifs, index, -1)) return;
            remapProfileAnimationIndices(remapIndexAfterSwap(index, index - 1));
            refreshEditorPanels();
            notifyChange();
        },
        onMoveDown: (index) => {
            if (!movePipelineRow(editorState.motifs, index, 1)) return;
            remapProfileAnimationIndices(remapIndexAfterSwap(index, index + 1));
            refreshEditorPanels();
            notifyChange();
        },
        onRemove: (index, row) => {
            editorState.motifs.splice(index, 1);
            if (selectedMotifId === pipelineRowId(row)) selectedMotifId = editorState.motifs[0] ? pipelineRowId(editorState.motifs[0]) : null;
            if (editorState.animation?.tracks) {
                editorState.animation.tracks = editorState.animation.tracks.filter((track) => {
                    const animIdx = track.editorMotifIndex;
                    if (animIdx === index) {
                        if (editorState.animation.tracks.length === 1) {
                            track.editorMotifIndex = 0;
                            syncAnimationParamRange(0);
                            return true;
                        }
                        return false;
                    }
                    if (animIdx > index) track.editorMotifIndex = animIdx - 1;
                    return true;
                });
                if (editorState.animation.selectedTrackIndex >= editorState.animation.tracks.length) editorState.animation.selectedTrackIndex = editorState.animation.tracks.length - 1;
            }
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
        hint.textContent = "Moves every layer below. Set X/Y here or animate X/Y in the Animation panel.";
        container.appendChild(hint);
    } else {
        const layerSelect = new SelectControl("Surface Mask", LAYER_OPTIONS, row.surfaceMask, (val) => {
            row.surfaceMask = val;
            notifyChange();
            refreshEditorPanels({ motifParams: false, animation: true, global: false });
        });
        container.appendChild(layerSelect.element);
    }
    renderSchemaFields(
        container,
        row.config,
        schema.fields.filter((field) => field.path !== "blendMode" && field.path !== "opacity"),
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
function reverseStageTrackData(stageData) {
    if (!stageData) return;
    const start = stageData.startValue;
    stageData.startValue = stageData.endValue;
    stageData.endValue = start;
    stageData.easing = mirrorEasingForReversedStage(stageData.easing);
}
function duplicateAnimationStage(stageIndex) {
    const anim = editorState?.animation;
    const source = anim?.stages?.[stageIndex];
    if (!anim || !source) return;
    const insertAt = stageIndex + 1;
    anim.stages.splice(insertAt, 0, { durationMs: source.durationMs ?? 2000, frames: source.frames ?? 30 });
    for (const track of anim.tracks) {
        if (!track.stages) track.stages = [];
        const src = track.stages[stageIndex] ?? { startValue: 0, endValue: 0, easing: "linear" };
        track.stages.splice(insertAt, 0, { startValue: src.startValue, endValue: src.endValue, easing: src.easing ?? "linear" });
    }
    anim.selectedStageIndex = insertAt;
}
function reverseAnimationStage(stageIndex) {
    const anim = editorState?.animation;
    if (!anim) return;
    for (const track of anim.tracks) reverseStageTrackData(track.stages?.[stageIndex]);
}
function renderSharedAnimationControls(container) {
    const divider = document.createElement("div");
    divider.className = "animation-divider";
    container.appendChild(divider);
    const activeStageIndex = editorState.animation.selectedStageIndex;
    const activeStage = editorState.animation.stages[activeStageIndex];
    renderSchemaFields(
        container,
        activeStage,
        [
            { path: "frames", label: `Stage ${activeStageIndex + 1} Frames`, min: 2, max: 120, step: 1 },
            { path: "durationMs", label: `Stage ${activeStageIndex + 1} Duration (ms)`, min: 200, max: 20000, step: 100 },
        ],
        () => notifyChange({ lightweight: true }),
    );
}
function renderAnimationParams(container) {
    container.innerHTML = "";
    if (!editorState) return;
    const enableWrap = document.createElement("label");
    enableWrap.className = "check-inline animation-enable-wrap";
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
        hint.textContent = "Timeline is included in export and used in-game. Use the animation preview above the map for playback.";
        container.appendChild(hint);
        return;
    }
    if (!editorState.animation.stages || editorState.animation.stages.length === 0) {
        editorState.animation.stages = [{ durationMs: 2000, frames: 30 }];
        editorState.animation.selectedStageIndex = 0;
    }
    if (!editorState.animation.tracks || editorState.animation.tracks.length === 0) {
        editorState.animation.tracks = [{ editorMotifIndex: 0, paramPath: "hueShift", stages: [{ startValue: 0, endValue: 360 }] }];
        editorState.animation.selectedTrackIndex = 0;
    }
    // Render stage tabs
    const stageHeader = document.createElement("div");
    stageHeader.className = "stage-header";
    const stagesList = editorState.animation.stages;
    stagesList.forEach((stage, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn-compact ${idx === editorState.animation.selectedStageIndex ? "primary" : "secondary"}`;
        btn.textContent = `Stage ${idx + 1}`;
        btn.addEventListener("click", () => {
            editorState.animation.selectedStageIndex = idx;
            notifyChange({ lightweight: true });
            renderAnimationParams(container);
        });
        stageHeader.appendChild(btn);
    });
    const addStageBtn = document.createElement("button");
    addStageBtn.type = "button";
    addStageBtn.className = "secondary btn-compact";
    addStageBtn.textContent = "+";
    addStageBtn.title = "Add Stage";
    addStageBtn.addEventListener("click", () => {
        const lastStage = stagesList[stagesList.length - 1];
        stagesList.push({ durationMs: lastStage?.durationMs ?? 2000, frames: lastStage?.frames ?? 30 });
        for (const track of editorState.animation.tracks) {
            if (!track.stages) track.stages = [];
            const lastStageData = track.stages[track.stages.length - 1];
            const val = lastStageData ? lastStageData.endValue : 0;
            const easing = lastStageData ? (lastStageData.easing ?? "linear") : "linear";
            track.stages.push({ startValue: val, endValue: val, easing: easing });
        }
        editorState.animation.selectedStageIndex = stagesList.length - 1;
        notifyChange({ lightweight: true });
        renderAnimationParams(container);
    });
    stageHeader.appendChild(addStageBtn);
    const dupStageBtn = document.createElement("button");
    dupStageBtn.type = "button";
    dupStageBtn.className = "secondary btn-compact";
    dupStageBtn.textContent = "Dup";
    dupStageBtn.title = "Duplicate current stage (inserts copy after it)";
    dupStageBtn.addEventListener("click", () => {
        duplicateAnimationStage(editorState.animation.selectedStageIndex);
        notifyChange({ lightweight: true });
        renderAnimationParams(container);
    });
    stageHeader.appendChild(dupStageBtn);
    const revStageBtn = document.createElement("button");
    revStageBtn.type = "button";
    revStageBtn.className = "secondary btn-compact";
    revStageBtn.textContent = "Rev";
    revStageBtn.title = "Reverse current stage: swap start/end; easeIn ↔ easeOut (linear & easeInOut unchanged)";
    revStageBtn.addEventListener("click", () => {
        reverseAnimationStage(editorState.animation.selectedStageIndex);
        notifyChange({ lightweight: true });
        renderAnimationParams(container);
    });
    stageHeader.appendChild(revStageBtn);
    if (stagesList.length > 1) {
        const removeStageBtn = document.createElement("button");
        removeStageBtn.type = "button";
        removeStageBtn.className = "secondary btn-compact";
        removeStageBtn.textContent = "✕";
        removeStageBtn.title = "Remove Current Stage";
        removeStageBtn.addEventListener("click", () => {
            const currentIdx = editorState.animation.selectedStageIndex;
            stagesList.splice(currentIdx, 1);
            for (const track of editorState.animation.tracks) track.stages.splice(currentIdx, 1);
            editorState.animation.selectedStageIndex = Math.max(0, currentIdx - 1);
            notifyChange({ lightweight: true });
            renderAnimationParams(container);
        });
        stageHeader.appendChild(removeStageBtn);
    }
    container.appendChild(stageHeader);
    // Render list of tracks
    const trackListContainer = document.createElement("div");
    trackListContainer.className = "track-list";
    editorState.animation.tracks.forEach((track, idx) => {
        const row = document.createElement("div");
        row.className = `track-row${idx === editorState.animation.selectedTrackIndex ? " selected" : ""}`;
        const motif = editorState.motifs[track.editorMotifIndex];
        const motifLabel = motif ? (MOTIF_TYPES[motif.config.type]?.label ?? motif.config.type) : "Unknown";
        const motifSurface = motif ? ` (${motif.surfaceMask})` : "";
        const paramLabel = track.paramPath;
        row.innerHTML = `
            <span class="track-label"><strong>Track #${idx + 1}:</strong> ${motifLabel}${motifSurface} - <span class="track-param-label">${paramLabel}</span></span>
            <span class="track-actions">
                <button type="button" data-action="remove" title="Remove track">✕</button>
            </span>
        `;
        row.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            editorState.animation.selectedTrackIndex = idx;
            renderAnimationParams(container);
        });
        const removeBtn = row.querySelector('[data-action="remove"]');
        if (editorState.animation.tracks.length > 1)
            removeBtn.addEventListener("click", () => {
                editorState.animation.tracks.splice(idx, 1);
                editorState.animation.selectedTrackIndex = Math.max(0, editorState.animation.selectedTrackIndex - 1);
                notifyChange({ lightweight: true });
                renderAnimationParams(container);
            });
        else removeBtn.classList.add("is-hidden");
        trackListContainer.appendChild(row);
    });
    container.appendChild(trackListContainer);
    // Add track button
    const addTrackBtn = document.createElement("button");
    addTrackBtn.type = "button";
    addTrackBtn.className = "secondary track-add-btn";
    addTrackBtn.textContent = "+ Add Animation Track";
    addTrackBtn.addEventListener("click", () => {
        const selectedIndex = getSelectedMotifIndex();
        const defaultMotifIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const motif = editorState.motifs[defaultMotifIndex];
        const fields = getAnimatableMotifFields(motif?.config) ?? [];
        const paramPath = fields[0]?.path ?? "hueShift";
        editorState.animation.tracks.push({
            editorMotifIndex: defaultMotifIndex,
            paramPath: paramPath,
            stages: editorState.animation.stages.map(() => ({ startValue: 0, endValue: fields[0]?.max ?? 360, easing: "linear" })),
        });
        editorState.animation.selectedTrackIndex = editorState.animation.tracks.length - 1;
        syncAnimationParamRange(editorState.animation.selectedTrackIndex);
        notifyChange({ lightweight: true });
        renderAnimationParams(container);
    });
    container.appendChild(addTrackBtn);
    const activeTrackIndex = editorState.animation.selectedTrackIndex;
    const activeTrack = editorState.animation.tracks[activeTrackIndex];
    if (!activeTrack) return;
    const row = editorState.motifs[activeTrack.editorMotifIndex];
    if (!row) {
        const msg = document.createElement("p");
        msg.className = "editor-hint";
        msg.textContent = "Select a motif layer for this track.";
        container.appendChild(msg);
        renderSharedAnimationControls(container);
        return;
    }
    const targetOptions = editorState.motifs.map((m, idx) => {
        const label = MOTIF_TYPES[m.config.type]?.label ?? m.config.type;
        return { value: idx.toString(), label: `#${idx + 1}: ${label} (${m.surfaceMask})${m.enabled ? "" : " (Disabled)"}` };
    });
    const targetSelect = new SelectControl("Target Motif", targetOptions, activeTrack.editorMotifIndex.toString(), (val) => {
        const newIndex = parseInt(val, 10);
        activeTrack.editorMotifIndex = newIndex;
        syncAnimationParamRange(activeTrackIndex);
        notifyChange({ lightweight: true });
        refreshEditorPanels({ motifList: false, motifParams: false, animation: true, global: false });
    });
    container.appendChild(targetSelect.element);
    if (!row.enabled) {
        const msg = document.createElement("p");
        msg.className = "editor-hint";
        msg.textContent = "Enable this motif layer to animate it.";
        container.appendChild(msg);
        renderSharedAnimationControls(container);
        return;
    }
    const animFields = getAnimatableMotifFields(row.config);
    if (animFields.length === 0) {
        const msg = document.createElement("p");
        msg.className = "editor-hint";
        msg.textContent = "Selected motif has no numeric sliders.";
        container.appendChild(msg);
        renderSharedAnimationControls(container);
        return;
    }
    const paramOptions = animFields.map((field) => ({ value: field.path, label: field.label }));
    const paramSelect = new SelectControl("Animated parameter", paramOptions, activeTrack.paramPath, (val) => {
        activeTrack.paramPath = val;
        syncAnimationParamRange(activeTrackIndex);
        notifyChange({ lightweight: true });
        renderAnimationParams(container);
    });
    container.appendChild(paramSelect.element);
    const activeField = animFields.find((f) => f.path === activeTrack.paramPath) ?? animFields[0];
    activeTrack.paramPath = activeField.path;
    const activeStageIndex = editorState.animation.selectedStageIndex;
    const stageData = activeTrack.stages[activeStageIndex];
    if (stageData)
        renderSchemaFields(
            container,
            stageData,
            [
                { path: "startValue", label: "Start", min: activeField.min, max: activeField.max, step: activeField.step },
                { path: "endValue", label: "End", min: activeField.min, max: activeField.max, step: activeField.step },
                { path: "easing", label: "Easing", options: EASING_OPTIONS },
            ],
            () => notifyChange({ lightweight: true }),
        );
    renderSharedAnimationControls(container);
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
        const row = { id: `m${nextMotifId++}`, enabled: true, surfaceMask: "all", blendMode: "add", config: deepClone(schema.defaults) };
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
