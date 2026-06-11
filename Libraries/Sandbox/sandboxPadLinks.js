import { findPickupAt } from "./findPickupAt.js";
import { getSandboxPad, hitTestPad } from "./sandboxPads.js";
import { isFlipperPickup } from "./behaviors/flipperBehavior.js";
/** @typedef {{ type: "pickup", id: number }} ButtonLinkPickupTarget */
/** @typedef {{ type: "pad", id: string }} ButtonLinkPadTarget */
/** @typedef {ButtonLinkPickupTarget | ButtonLinkPadTarget} ButtonLinkTarget */
/** @param {ButtonLinkTarget} target */
function linkKey(target) {
    return `${target.type}:${target.id}`;
}
/** @param {object} pad */
export function getButtonPadLinks(pad) {
    if (pad.buttonLinks?.length) return pad.buttonLinks;
    /** @type {ButtonLinkTarget[]} */
    const links = [];
    if (pad.targetPickupId != null) links.push({ type: "pickup", id: pad.targetPickupId });
    if (pad.targetPadId) links.push({ type: "pad", id: pad.targetPadId });
    return links;
}
/** @param {object} pad */
export function setButtonPadLinks(pad, links) {
    pad.buttonLinks = links.map((link) => ({ ...link }));
    delete pad.targetPickupId;
    delete pad.targetPadId;
}
/** @param {object} pad @param {ButtonLinkTarget} target */
function hasButtonPadLink(pad, target) {
    return getButtonPadLinks(pad).some((link) => linkKey(link) === linkKey(target));
}
/**
 * @param {object} state
 * @param {string} buttonPadId
 * @param {ButtonLinkTarget} target
 */
export function addButtonPadLink(state, buttonPadId, target) {
    const pad = getSandboxPad(state, buttonPadId);
    if (!pad || pad.preset !== "button") return false;
    if (hasButtonPadLink(pad, target)) return true;
    setButtonPadLinks(pad, [...getButtonPadLinks(pad), target]);
    return true;
}
/**
 * @param {object} state
 * @param {string} buttonPadId
 * @param {ButtonLinkTarget} target
 */
export function removeButtonPadLink(state, buttonPadId, target) {
    const pad = getSandboxPad(state, buttonPadId);
    if (!pad || pad.preset !== "button") return false;
    setButtonPadLinks(
        pad,
        getButtonPadLinks(pad).filter((link) => linkKey(link) !== linkKey(target)),
    );
    return true;
}
/** @param {object} state @param {string} buttonPadId */
export function clearButtonPadLinks(state, buttonPadId) {
    const pad = getSandboxPad(state, buttonPadId);
    if (!pad || pad.preset !== "button") return false;
    pad.buttonLinks = [];
    delete pad.targetPickupId;
    delete pad.targetPadId;
    return true;
}
/** @param {object} pickup */
export function isButtonLinkPickup(pickup) {
    return isFlipperPickup(pickup);
}
/** @param {object} pad */
export function isButtonLinkPad(pad) {
    return pad.preset === "gate";
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @param {string} sourcePadId
 */
export function findButtonLinkTarget(state, worldX, worldY, sourcePadId) {
    const pickup = findPickupAt(state.pickups, worldX, worldY);
    if (pickup && isButtonLinkPickup(pickup)) return { type: "pickup", id: pickup.id };
    const pad = hitTestPad(state, worldX, worldY);
    if (pad && pad.id !== sourcePadId && isButtonLinkPad(pad)) return { type: "pad", id: pad.id };
    return null;
}
/** @param {object} state @param {ButtonLinkTarget} target */
export function resolveButtonLinkEndpoint(state, target) {
    if (target.type === "pad") {
        const gate = getSandboxPad(state, target.id);
        if (!gate) return null;
        return { target, label: `Gate · ${gate.id}`, x: gate.x, y: gate.y };
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
/** @param {object} state @param {object} buttonPad */
export function describeButtonPadLinks(state, buttonPad) {
    return listButtonPadLinkEndpoints(state, buttonPad).map((entry) => entry.label);
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
        const from = getSandboxPad(state, wireFromPadId);
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
