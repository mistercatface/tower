import { wakeKineticBody } from "../../Motion/kineticSleep.js";
import { syncFloorPropCollisionShape, syncFloorTriggerAabb } from "../../Spatial/zones/floorShapes.js";
import { isButtonEntity, isMassButtonInputMode } from "../../Sandbox/buttonInput.js";
import { appendActionRow, appendEditorHint, appendInstanceList, appendNumberField, appendSelectField, appendTranslateFields } from "../../UI/paramFields.js";
import { setFormFieldName } from "../../UI/Component.js";
/** @param {object} prop @param {number} degrees */
function applyWorldPropFacing(prop, degrees) {
    prop.facing = (degrees * Math.PI) / 180;
    prop.angularVelocity = 0;
    prop.strategy.syncCollisionShape?.(prop);
}
/** @param {object} prop @param {{ x?: number, y?: number }} pos */
function applyWorldPropPosition(prop, { x, y }) {
    if (x != null) prop.x = x;
    if (y != null) prop.y = y;
    if (prop.aabb) syncFloorTriggerAabb(prop);
    if (prop.strategy?.isKinetic) wakeKineticBody(prop);
}
/** @param {object} prop @param {{ radius?: number, sinkDepth?: number, captureTolerance?: number }} patch */
function applyVoidPitPatch(prop, patch) {
    if (patch.radius != null) {
        prop.radius = patch.radius;
        syncFloorPropCollisionShape(prop);
    }
    if (patch.sinkDepth != null) prop.sinkDepth = patch.sinkDepth;
    if (patch.captureTolerance != null) prop.captureTolerance = patch.captureTolerance;
    if (prop.aabb) syncFloorTriggerAabb(prop);
}
/** @param {object} prop @param {{ radius?: number, inputMode?: string, massThreshold?: number, invert?: boolean }} patch */
function applyButtonFloorPatch(prop, patch) {
    if (patch.radius != null) {
        prop.radius = patch.radius;
        syncFloorPropCollisionShape(prop);
        syncFloorTriggerAabb(prop);
    }
    if (patch.inputMode != null) {
        prop.inputMode = patch.inputMode;
        prop._toggleLatched = false;
        prop._massWasActive = false;
        prop._buttonWasActive = false;
    }
    if (patch.massThreshold != null) prop.massThreshold = patch.massThreshold;
    if (patch.invert != null) prop.invert = patch.invert;
}
/**
 * @param {HTMLElement} body
 * @param {{
 *   listLinks: () => { target: import("./buttonLinks.js").ButtonLinkTarget, label: string }[],
 *   isWireActive: () => boolean,
 *   startWire: () => void,
 *   cancelWire: () => void,
 *   clearLinks: () => void,
 *   removeLink: (target: import("./buttonLinks.js").ButtonLinkTarget) => void,
 * }} wire
 */
export function appendButtonWireInspector(body, wire) {
    const links = wire.listLinks();
    appendEditorHint(body, links.length ? `${links.length} wire${links.length === 1 ? "" : "s"} connected` : "No wires — link to flippers, spawners, or forcefields.");
    if (links.length)
        appendInstanceList(
            body,
            links.map((entry) => ({
                label: entry.label,
                onDelete: () => {
                    wire.removeLink(entry.target);
                },
            })),
        );
    const wireActive = wire.isWireActive();
    appendActionRow(body, [
        {
            label: wireActive ? "Click targets to wire…" : "Connect wire",
            variant: wireActive ? "primary" : "secondary",
            onClick: () => {
                if (wireActive) wire.cancelWire();
                else wire.startWire();
            },
        },
        ...(links.length ? [{ label: "Clear all", onClick: () => wire.clearLinks() }] : []),
    ]);
}
/**
 * @param {HTMLElement} body
 * @param {{
 *   listLinks: () => { linkId: number, corridorIndex: number, label: string }[],
 *   isWireActive: () => boolean,
 *   startWire: () => void,
 *   cancelWire: () => void,
 *   clearLinks: () => void,
 *   removeLink: (linkId: number) => void,
 *   selectedLinkId?: () => number | null,
 *   selectedCorridorIndex?: () => number,
 *   selectLink?: (linkId: number, corridorIndex: number) => void,
 * }} wire
 */
export function appendRoomNodeWireInspector(body, wire) {
    const links = wire.listLinks();
    const selectedLinkId = wire.selectedLinkId?.() ?? null;
    const selectedCorridorIndex = wire.selectedCorridorIndex?.() ?? 0;
    appendEditorHint(
        body,
        links.length
            ? `${links.length} corridor${links.length === 1 ? "" : "s"} linked — pick one below to edit in Scene or here.`
            : "No corridor links yet — pick Rail corridor or Empty corridor from Props, then click two room nodes.",
    );
    if (links.length)
        appendInstanceList(
            body,
            links.map((entry) => ({
                label: entry.label,
                selected: entry.linkId === selectedLinkId && entry.corridorIndex === selectedCorridorIndex,
                onSelect: wire.selectLink
                    ? () => {
                          wire.selectLink(entry.linkId, entry.corridorIndex);
                      }
                    : undefined,
                onDelete: () => {
                    wire.removeLink(entry.linkId);
                },
            })),
        );
    if (!wire.startWire) return;
    const wireActive = wire.isWireActive();
    appendActionRow(body, [
        {
            label: wireActive ? "Click a room node to link…" : "Connect…",
            variant: wireActive ? "primary" : "secondary",
            onClick: () => {
                if (wireActive) wire.cancelWire();
                else wire.startWire();
            },
        },
        ...(links.length && wire.clearLinks ? [{ label: "Clear all", onClick: () => wire.clearLinks() }] : []),
    ]);
}
/**
 * @param {HTMLElement} body
 * @param {object} prop
 * @param {{ state: object, onChange: () => void }} ctx
 */
export function appendSandboxWorldPropInspectorFields(body, prop, { state, onChange }) {
    const patch = (apply) => {
        apply();
        onChange();
    };
    appendTranslateFields(body, { x: prop.x, y: prop.y, onPatch: (pos) => patch(() => applyWorldPropPosition(prop, pos)) });
    const isVoidPit = prop.triggers?.some((trigger) => trigger.effect === "sink");
    if (isVoidPit) {
        appendNumberField(body, "Radius", { value: prop.radius, step: 0.5, min: 0.5, onChange: (radius) => patch(() => applyVoidPitPatch(prop, { radius })) });
        appendNumberField(body, "Depth", { value: prop.sinkDepth, step: 1, min: 1, onChange: (sinkDepth) => patch(() => applyVoidPitPatch(prop, { sinkDepth })) });
        appendNumberField(body, "Capture", { value: prop.captureTolerance, step: 0.05, min: 0, onChange: (captureTolerance) => patch(() => applyVoidPitPatch(prop, { captureTolerance })) });
        return;
    }
    if (isButtonEntity(prop)) {
        appendNumberField(body, "Radius", { value: prop.radius, step: 0.5, min: 0.5, onChange: (radius) => patch(() => applyButtonFloorPatch(prop, { radius })) });
        appendSelectField(body, "Input", {
            value: prop.inputMode,
            options: [
                { value: "tap", label: "Tap" },
                { value: "hold", label: "Hold" },
                { value: "toggle", label: "Toggle" },
                { value: "massTap", label: "Mass – Tap" },
                { value: "massHold", label: "Mass – Hold" },
                { value: "massToggle", label: "Mass – Toggle" },
            ],
            onChange: (inputMode) => patch(() => applyButtonFloorPatch(prop, { inputMode })),
        });
        if (isMassButtonInputMode(prop.inputMode))
            appendNumberField(body, "Mass threshold", { value: prop.massThreshold, step: 0.01, min: 0, onChange: (massThreshold) => patch(() => applyButtonFloorPatch(prop, { massThreshold })) });
        const invertRow = document.createElement("label");
        invertRow.className = "param-field";
        const invertCheck = document.createElement("input");
        invertCheck.type = "checkbox";
        setFormFieldName(invertCheck, "buttonInvert");
        invertCheck.checked = prop.invert;
        invertCheck.addEventListener("change", () => patch(() => applyButtonFloorPatch(prop, { invert: invertCheck.checked })));
        invertRow.append("Invert (NOT) ", invertCheck);
        body.appendChild(invertRow);
        return;
    }
    appendNumberField(body, "Facing (°)", { value: Math.round(((prop.facing ?? 0) * 180) / Math.PI), step: 5, onChange: (degrees) => patch(() => applyWorldPropFacing(prop, degrees)) });
}
