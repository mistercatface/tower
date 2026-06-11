import { findPickupAt } from "./findPickupAt.js";
import { hitTestPad } from "./sandboxPads.js";
import { isFlipperPickup } from "./behaviors/flipperBehavior.js";
/** @param {object} state @param {string} id */
function findSandboxPad(state, id) {
    return state.sandboxPads.find((pad) => pad.id === id) ?? null;
}
/** @typedef {{ type: "pickup", id: number }} ButtonLinkPickupTarget */
/** @typedef {{ type: "pad", id: string }} ButtonLinkPadTarget */
/** @typedef {ButtonLinkPickupTarget | ButtonLinkPadTarget} ButtonLinkTarget */
/** @param {object} pad */
export function isButtonLinkTargetPad(pad) {
    return pad.preset === "pull" || pad.preset === "sink";
}
/** @param {object} pad */
export function getButtonPadLinks(pad) {
    return pad.buttonLinks;
}
/** @param {object} pad @param {ButtonLinkTarget[]} links */
function setButtonPadLinks(pad, links) {
    pad.buttonLinks = links.map((link) => ({ ...link }));
}
/** @param {ButtonLinkTarget} a @param {ButtonLinkTarget} b */
function sameButtonLink(a, b) {
    return a.type === b.type && a.id === b.id;
}
/**
 * @param {object} state
 * @param {string} buttonPadId
 * @param {ButtonLinkTarget} target
 */
export function addButtonPadLink(state, buttonPadId, target) {
    const pad = findSandboxPad(state, buttonPadId);
    if (!pad || pad.preset !== "button") return false;
    const links = getButtonPadLinks(pad);
    if (links.some((link) => sameButtonLink(link, target))) return true;
    setButtonPadLinks(pad, [...links, target]);
    return true;
}
/**
 * @param {object} state
 * @param {string} buttonPadId
 * @param {ButtonLinkTarget} target
 */
export function removeButtonPadLink(state, buttonPadId, target) {
    const pad = findSandboxPad(state, buttonPadId);
    if (!pad || pad.preset !== "button") return false;
    setButtonPadLinks(
        pad,
        getButtonPadLinks(pad).filter((link) => !sameButtonLink(link, target)),
    );
    return true;
}
/** @param {object} state @param {string} buttonPadId */
export function clearButtonPadLinks(state, buttonPadId) {
    const pad = findSandboxPad(state, buttonPadId);
    if (!pad || pad.preset !== "button") return false;
    pad.buttonLinks = [];
    return true;
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @param {string} sourcePadId
 */
export function findButtonLinkTarget(state, worldX, worldY, sourcePadId) {
    const pickup = findPickupAt(state.pickups, worldX, worldY);
    if (pickup && isFlipperPickup(pickup)) return { type: "pickup", id: pickup.id };
    const pad = hitTestPad(state, worldX, worldY);
    if (pad && pad.id !== sourcePadId && isButtonLinkTargetPad(pad)) return { type: "pad", id: pad.id };
    return null;
}
/** @param {object} state @param {ButtonLinkTarget} target */
export function resolveButtonLinkEndpoint(state, target) {
    if (target.type === "pad") {
        const pad = findSandboxPad(state, target.id);
        if (!pad) return null;
        return { target, label: `${pad.preset} · ${pad.id}`, x: pad.x, y: pad.y };
    }
    const pickup = state.pickups.find((entry) => entry.id === target.id && !entry.isDead);
    if (!pickup) return null;
    const typeLabel = (pickup.type ?? "prop").replace(/_/g, " ");
    return { target, label: `${typeLabel} · #${pickup.id}`, x: pickup.x, y: pickup.y };
}
/** @param {object} state @param {object} buttonPad */
export function listButtonPadLinkEndpoints(state, buttonPad) {
    /** @type {{ target: ButtonLinkTarget, label: string, x: number, y: number }[]} */
    const endpoints = [];
    const links = getButtonPadLinks(buttonPad);
    for (let i = 0; i < links.length; i++) {
        const endpoint = resolveButtonLinkEndpoint(state, links[i]);
        if (endpoint) endpoints.push(endpoint);
    }
    return endpoints;
}
/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {{ wireFromPadId?: string | null, wireCursor?: { x: number, y: number } | null }} [options] */
export function drawSandboxPadWires(ctx, state, { wireFromPadId = null, wireCursor = null } = {}) {
    const pads = state.sandboxPads;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad.preset !== "button") continue;
        const endpoints = listButtonPadLinkEndpoints(state, pad);
        const color = pad.id === wireFromPadId ? "#FFB74D" : "#FF7043";
        for (let j = 0; j < endpoints.length; j++) drawWire(ctx, pad.x, pad.y, endpoints[j].x, endpoints[j].y, color);
    }
    if (wireFromPadId && wireCursor) {
        const from = findSandboxPad(state, wireFromPadId);
        if (from) drawWire(ctx, from.x, from.y, wireCursor.x, wireCursor.y, "#FFB74D");
    }
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {string} color */
function drawWire(ctx, x0, y0, x1, y1, color) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x1, y1, 3, 0, Math.PI * 2);
    ctx.fill();
}
