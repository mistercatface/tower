import { collectStepValidationErrors, validateStepConfig } from "../Pipeline/validatePipeline.js";
import { createStepRegistry } from "../Pipeline/stepRegistry.js";
/** @param {unknown} treeEdges */
function validateTreeEdges(treeEdges) {
    if (treeEdges == null) return null;
    if (!Array.isArray(treeEdges)) return "treeEdges must be an array";
    for (let i = 0; i < treeEdges.length; i++) {
        const edge = treeEdges[i];
        if (!Array.isArray(edge) || edge.length !== 2) return `treeEdges[${i}] must be [parent, child]`;
        if (!Number.isInteger(edge[0]) || !Number.isInteger(edge[1])) return `treeEdges[${i}] indices must be integers`;
        if (edge[0] < 0 || edge[1] < 0) return `treeEdges[${i}] indices must be >= 0`;
    }
    return null;
}
/** @param {unknown} treeEdges @param {unknown} nodeCount */
function validateTreeEdgesForNodeCount(treeEdges, nodeCount) {
    const formatError = validateTreeEdges(treeEdges);
    if (formatError) return formatError;
    if (treeEdges == null || !Array.isArray(treeEdges) || treeEdges.length === 0) return null;
    const count = Number(nodeCount);
    if (!Number.isInteger(count) || count < 1) return null;
    const need = count - 1;
    if (treeEdges.length !== need) return `treeEdges has ${treeEdges.length} edges; room count ${count} needs ${need} (or remove treeEdges for a random tree)`;
    return null;
}
const corridorCountField = { path: "corridorCount", label: "Corridor count", min: 1, max: 8, step: 1 };
const corridorWidthField = { path: "corridorWidth", label: "Corridor width", min: 1, max: 4, step: 1 };
/** @type {ReturnType<typeof createStepRegistry>} */
export const ROOM_GRAPH_STEP_REGISTRY = createStepRegistry();
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "buildNodeGraph",
    label: "Build node graph",
    defaults: { op: "buildNodeGraph", nodeCount: 4, placement: "treeSpread" },
    fields: [
        { path: "nodeCount", label: "Room count", min: 1, max: 32, step: 1 },
        { path: "roomMinWidth", label: "Min room width", min: 4, max: 32, step: 1 },
        { path: "roomMaxWidth", label: "Max room width", min: 4, max: 32, step: 1 },
        { path: "roomMinHeight", label: "Min room height", min: 4, max: 32, step: 1 },
        { path: "roomMaxHeight", label: "Max room height", min: 4, max: 32, step: 1 },
        { path: "nodeSpacingPad", label: "Node spacing pad", min: 0, max: 16, step: 1 },
        { path: "gridCols", label: "Grid cols", min: 16, max: 512, step: 1 },
        { path: "gridRows", label: "Grid rows", min: 16, max: 512, step: 1 },
        {
            path: "placement",
            label: "Placement",
            kind: "select",
            options: [
                { value: "random", label: "Random" },
                { value: "treeSpread", label: "Tree spread" },
            ],
        },
    ],
    validate: (config) => validateTreeEdgesForNodeCount(config.treeEdges, config.nodeCount),
});
ROOM_GRAPH_STEP_REGISTRY.register({ id: "buildClosedRooms", label: "Build closed rooms", defaults: { op: "buildClosedRooms" } });
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "punchHolePerIncidentEdge",
    label: "Punch holes per incident edge",
    defaults: { op: "punchHolePerIncidentEdge", corridorCount: 1, corridorWidth: 1 },
    fields: [corridorCountField, corridorWidthField],
});
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "forEachNode",
    label: "For each node",
    defaults: { op: "forEachNode", run: { op: "punchHolePerIncidentEdge" } },
    fields: [corridorCountField, corridorWidthField],
    slots: [{ name: "run", required: true, allowedSteps: ["punchHolePerIncidentEdge"] }],
});
ROOM_GRAPH_STEP_REGISTRY.register({ id: "punchHolesTowardNeighbors", label: "Punch holes toward neighbors", defaults: { op: "punchHolesTowardNeighbors" } });
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "buildCorridorForEdge",
    label: "Build corridor for edge",
    defaults: { op: "buildCorridorForEdge", corridorCount: 1, corridorWidth: 1, skipPunchIfHolesPresent: false },
    fields: [corridorCountField, corridorWidthField],
});
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "forEachEdge",
    label: "For each edge",
    defaults: { op: "forEachEdge", requireAll: true, canIntersect: false, run: { op: "buildCorridorForEdge" } },
    fields: [corridorCountField, corridorWidthField, { path: "limit", label: "Edge limit", min: 1, max: 64, step: 1 }],
    slots: [{ name: "run", required: true, allowedSteps: ["buildCorridorForEdge", "punchHolesTowardNeighbors"] }],
});
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "validateLayout",
    label: "Validate layout",
    defaults: { op: "validateLayout", allTreeEdgesRouted: true, corridorsIntersect: false },
    fields: [
        { path: "minNodes", label: "Min rooms", min: 1, max: 32, step: 1 },
        corridorCountField,
        corridorWidthField,
        { path: "corridorsAtLeast", label: "Corridors at least", min: 0, max: 128, step: 1 },
    ],
});
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "spawnPropsInNode",
    label: "Spawn props in node",
    defaults: { op: "spawnPropsInNode", nodeId: 0, props: [] },
    fields: [{ path: "nodeId", label: "Node id", min: 0, max: 31, step: 1 }],
    validate: (config) => (Array.isArray(config.props) ? null : "props must be an array"),
});
ROOM_GRAPH_STEP_REGISTRY.register({ id: "spawnPropsPerRoom", label: "Spawn props per room", defaults: { op: "spawnPropsPerRoom" } });
ROOM_GRAPH_STEP_REGISTRY.register({ id: "punchOneHolePerRoom", label: "Punch one hole per room", defaults: { op: "punchOneHolePerRoom" } });
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "buildCorridors",
    label: "Build corridors",
    defaults: { op: "buildCorridors", corridorEdgeCount: 1 },
    fields: [{ path: "corridorEdgeCount", label: "Corridor edge count", min: 1, max: 64, step: 1 }],
});
ROOM_GRAPH_STEP_REGISTRY.register({ id: "buildAllCorridors", label: "Build all corridors", defaults: { op: "buildAllCorridors" } });
ROOM_GRAPH_STEP_REGISTRY.register({
    id: "retryUntil",
    label: "Retry until",
    defaults: { op: "retryUntil", maxAttempts: 60, body: [], until: { op: "validateLayout" } },
    fields: [{ path: "maxAttempts", label: "Max attempts", min: 1, max: 500, step: 1 }],
    slots: [
        { name: "body", required: true, array: true },
        { name: "until", required: true, allowedSteps: ["validateLayout"] },
    ],
});
/** @param {unknown} motifs @returns {import("../Pipeline/validatePipeline.js").PipelineValidationResult} */
export function validateRoomGraphMotifs(motifs) {
    if (!Array.isArray(motifs) || motifs.length === 0) return { ok: false, errors: [{ path: "", message: "motifs must be a non-empty array" }] };
    if (motifs.length === 1 && /** @type {{ op?: string }} */ (motifs[0]).op === "retryUntil")
        return validateStepConfig(/** @type {Record<string, unknown>} */ (motifs[0]), ROOM_GRAPH_STEP_REGISTRY, { pathPrefix: "[0]" });
    /** @type {import("../Pipeline/validatePipeline.js").PipelineValidationError[]} */
    const errors = [];
    for (let i = 0; i < motifs.length; i++) {
        if (/** @type {{ op?: string }} */ (motifs[i]).op === "retryUntil") errors.push({ path: `[${i}]`, message: "retryUntil must be the sole top-level motif" });
        errors.push(...collectStepValidationErrors(/** @type {Record<string, unknown>} */ (motifs[i]), ROOM_GRAPH_STEP_REGISTRY, { pathPrefix: `[${i}]` }));
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
