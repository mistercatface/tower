import { clampLinkCorridorRanges, ensureLinkCorridorFields } from "./roomGraphLinkCorridor.js";
import { CORRIDOR_TYPE_EMPTY, CORRIDOR_TYPE_OPEN, normalizeCorridorType, formatCorridorTypeLabel } from "./roomGraphCorridorTypes.js";
/** @typedef {{ id: number, col: number, row: number, width: number, height: number }} RoomNode */
/** @typedef {{ id: number, a: number, b: number, corridorType?: string, corridorCount?: number, corridorWidthMin?: number, corridorWidthMax?: number, seed?: number }} RoomLink */
/** @typedef {{ nodes: RoomNode[], links: RoomLink[], nextNodeId: number, nextLinkId: number, bakedRails?: { col: number, row: number, side: number, heightLevel?: number, thicknessLevel?: number }[], bakedFloorBelts?: { col: number, row: number, kind: number, facingIndex: number }[] }} RoomGraphDoc */
/** @param {object} state @returns {RoomGraphDoc} */
export function getRoomGraph(state) {
    if (!state.roomGraph) state.roomGraph = { nodes: [], links: [], nextNodeId: 0, nextLinkId: 0, bakedRails: [], bakedFloorBelts: [] };
    return state.roomGraph;
}
/** @param {object} state */
export function clearRoomGraph(state) {
    state.roomGraph = { nodes: [], links: [], nextNodeId: 0, nextLinkId: 0, bakedRails: [], bakedFloorBelts: [] };
}
/** @param {object} state @returns {RoomNode[]} */
export function listRoomNodes(state) {
    return getRoomGraph(state).nodes;
}
/** @param {object} state @returns {RoomLink[]} */
export function listRoomLinks(state) {
    return getRoomGraph(state).links;
}
/** @param {object} state @param {number} id @returns {RoomNode | undefined} */
export function getRoomNode(state, id) {
    const nodes = listRoomNodes(state);
    for (let i = 0; i < nodes.length; i++) if (nodes[i].id === id) return nodes[i];
}
/** @param {object} state @param {number} id @returns {RoomLink | undefined} */
export function getRoomLink(state, id) {
    const links = listRoomLinks(state);
    for (let i = 0; i < links.length; i++) if (links[i].id === id) return links[i];
}
/** @param {object} state @param {number} col @param {number} row @returns {RoomNode | null} */
export function pickRoomNodeAt(state, col, row) {
    const nodes = listRoomNodes(state);
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (col >= node.col && col < node.col + node.width && row >= node.row && row < node.row + node.height) return node;
    }
    return null;
}
/** @param {RoomNode} node @param {number} col @param {number} row */
export function roomNodeContainsCell(node, col, row) {
    return col >= node.col && col < node.col + node.width && row >= node.row && row < node.row + node.height;
}
/** @param {object} state @param {number} col @param {number} row */
export function roomNodeOccupiesCell(state, col, row) {
    return pickRoomNodeAt(state, col, row) != null;
}
/** @param {object} state @param {Omit<RoomNode, "id">} spec @returns {RoomNode} */
export function addRoomNode(state, spec) {
    const graph = getRoomGraph(state);
    const node = { id: graph.nextNodeId++, ...spec };
    graph.nodes.push(node);
    return node;
}
/** @param {object} state @param {number} nodeId @returns {boolean} */
export function removeRoomNode(state, nodeId) {
    const graph = getRoomGraph(state);
    const before = graph.nodes.length;
    graph.nodes = graph.nodes.filter((node) => node.id !== nodeId);
    graph.links = graph.links.filter((link) => link.a !== nodeId && link.b !== nodeId);
    return graph.nodes.length < before;
}
/** @param {object} state @param {number} nodeId @returns {RoomLink[]} */
export function linksForNode(state, nodeId) {
    const links = listRoomLinks(state);
    /** @type {RoomLink[]} */
    const out = [];
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.a === nodeId || link.b === nodeId) out.push(link);
    }
    return out;
}
/** @param {object} state @param {number} nodeId @returns {number[]} */
export function neighborNodeIds(state, nodeId) {
    const links = linksForNode(state, nodeId);
    /** @type {number[]} */
    const neighbors = [];
    for (let i = 0; i < links.length; i++) {
        const other = links[i].a === nodeId ? links[i].b : links[i].a;
        if (!neighbors.includes(other)) neighbors.push(other);
    }
    return neighbors;
}
/** @param {RoomNode} node @returns {{ col: number, row: number }} */
export function roomNodeCenterCell(node) {
    return { col: (node.col + (node.width - 1) / 2) | 0, row: (node.row + (node.height - 1) / 2) | 0 };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {RoomNode} node @returns {{ x: number, y: number }} */
export function roomNodeCenterWorld(grid, node) {
    const { col, row } = roomNodeCenterCell(node);
    return grid.gridToWorld(col, row);
}
/** @param {object} state @param {number} a @param {number} b @returns {RoomLink | null} */
export function findRoomLinkBetween(state, a, b) {
    const links = listRoomLinks(state);
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.a === a && link.b === b) return link;
    }
    return null;
}
/** @param {object} state @param {number} a @param {number} b @param {{ corridorType?: string }} [options] @returns {RoomLink | null} */
export function addRoomLink(state, a, b, options = {}) {
    if (a === b) return null;
    const graph = getRoomGraph(state);
    const link = {
        id: graph.nextLinkId++,
        a,
        b,
        corridorType: normalizeCorridorType(options.corridorType),
        corridorCount: 1,
        corridorWidthMin: 1,
        corridorWidthMax: 1,
        seed: (Math.random() * 0xffffffff) | 0,
    };
    graph.links.push(link);
    return link;
}
/** @param {object} state @param {number} linkId @param {{ corridorType?: string, corridorCount?: number, corridorWidthMin?: number, corridorWidthMax?: number, seed?: number }} patch @returns {boolean} */
export function updateRoomLink(state, linkId, patch) {
    const link = getRoomLink(state, linkId);
    if (!link) return false;
    if (patch.corridorType != null) link.corridorType = patch.corridorType;
    if (patch.corridorCount != null) link.corridorCount = Math.round(patch.corridorCount);
    if (patch.corridorWidthMin != null) link.corridorWidthMin = Math.round(patch.corridorWidthMin);
    if (patch.corridorWidthMax != null) link.corridorWidthMax = Math.round(patch.corridorWidthMax);
    if (patch.seed != null) link.seed = patch.seed | 0;
    const nodeA = getRoomNode(state, link.a);
    const nodeB = getRoomNode(state, link.b);
    if (nodeA && nodeB) clampLinkCorridorRanges(link, nodeA, nodeB);
    else ensureLinkCorridorFields(link);
    return true;
}
/** @param {object} state @param {number} linkId @returns {boolean} */
export function removeRoomLink(state, linkId) {
    const graph = getRoomGraph(state);
    const before = graph.links.length;
    graph.links = graph.links.filter((link) => link.id !== linkId);
    return graph.links.length < before;
}
/** @param {object} state @param {number} nodeId */
export function clearRoomLinksForNode(state, nodeId) {
    const graph = getRoomGraph(state);
    graph.links = graph.links.filter((link) => link.a !== nodeId && link.b !== nodeId);
}
/** @param {RoomLink} link */
export function formatRoomLinkLabel(link) {
    return `Link #${link.id} · node ${link.a} → node ${link.b}`;
}
/** @param {RoomLink} link */
export function roomLinkCorridorLaneCount(link) {
    return Math.max(1, Math.round(link.corridorCount ?? 1));
}
/** @param {RoomLink} link */
export function formatRoomLinkCorridorFlowNote(link) {
    const type = normalizeCorridorType(link.corridorType);
    if (type === CORRIDOR_TYPE_EMPTY) return "rail-walled passage";
    if (type === CORRIDOR_TYPE_OPEN) return "open passage";
    return "one-way belts";
}
/** @param {RoomLink} link @param {number} corridorIndex */
export function formatRoomLinkCorridorLabel(link, corridorIndex) {
    const count = roomLinkCorridorLaneCount(link);
    const lanePart = count > 1 ? ` · lane ${corridorIndex + 1}/${count}` : "";
    const typeLabel = formatCorridorTypeLabel(normalizeCorridorType(link.corridorType));
    return `${typeLabel} #${link.id} · node ${link.a} → node ${link.b}${lanePart}`;
}
/** @param {number} nodeId @param {RoomLink} link @param {number} corridorIndex */
export function formatRoomLinkCorridorLabelForNode(nodeId, link, corridorIndex) {
    const count = roomLinkCorridorLaneCount(link);
    const lanePart = count > 1 ? ` · corridor ${corridorIndex + 1}/${count}` : "";
    const flow = formatRoomLinkCorridorFlowNote(link);
    if (link.a === nodeId) return `Link #${link.id} · → node ${link.b}${lanePart} · ${flow}`;
    return `Link #${link.id} · node ${link.a} → here${lanePart} · ${flow}`;
}
/** @param {number} nodeId @param {RoomLink} link */
export function formatRoomLinkLabelForNode(nodeId, link) {
    if (link.a === nodeId) return `Link #${link.id} · → node ${link.b}`;
    return `Link #${link.id} · node ${link.a} → here`;
}
/** @param {RoomNode} node */
export function formatRoomNodeLabel(node) {
    return `Room node #${node.id} · ${node.width}×${node.height} @ (${node.col},${node.row})`;
}
/** @param {object} state @returns {{ linkId: number, corridorIndex: number, a: number, b: number, label: string }[]} */
export function listRoomLinkCorridorSceneEntries(state) {
    const links = listRoomLinks(state);
    /** @type {{ linkId: number, corridorIndex: number, a: number, b: number, label: string }[]} */
    const entries = [];
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const count = roomLinkCorridorLaneCount(link);
        for (let ci = 0; ci < count; ci++) entries.push({ linkId: link.id, corridorIndex: ci, a: link.a, b: link.b, label: formatRoomLinkCorridorLabel(link, ci) });
    }
    return entries;
}
/** @param {object} state @param {number} nodeId @returns {{ link: RoomLink, otherNodeId: number, corridorIndex: number, label: string }[]} */
export function listRoomNodeCorridorEntries(state, nodeId) {
    const links = linksForNode(state, nodeId);
    /** @type {{ link: RoomLink, otherNodeId: number, corridorIndex: number, label: string }[]} */
    const entries = [];
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const otherNodeId = link.a === nodeId ? link.b : link.a;
        const count = roomLinkCorridorLaneCount(link);
        for (let ci = 0; ci < count; ci++) entries.push({ link, otherNodeId, corridorIndex: ci, label: formatRoomLinkCorridorLabelForNode(nodeId, link, ci) });
    }
    return entries;
}
/** @param {object} state @param {RoomGraphDoc} doc */
export function replaceRoomGraph(state, doc) {
    const links = doc.links.map((link) => {
        const copy = { ...link };
        ensureLinkCorridorFields(copy);
        const nodeA = doc.nodes.find((node) => node.id === copy.a);
        const nodeB = doc.nodes.find((node) => node.id === copy.b);
        if (nodeA && nodeB) clampLinkCorridorRanges(copy, nodeA, nodeB);
        return copy;
    });
    state.roomGraph = { nodes: doc.nodes.map((node) => ({ ...node })), links, nextNodeId: doc.nextNodeId, nextLinkId: doc.nextLinkId, bakedRails: [], bakedFloorBelts: [] };
}
/** @param {object} state @returns {RoomGraphDoc} */
export function cloneRoomGraphDoc(state) {
    const graph = getRoomGraph(state);
    return { nodes: graph.nodes.map((node) => ({ ...node })), links: graph.links.map((link) => ({ ...link })), nextNodeId: graph.nextNodeId, nextLinkId: graph.nextLinkId };
}
