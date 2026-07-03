import { PLACEABLE_INSPECTOR_KINDS } from "../../Sandbox/sandboxScenePlaceables.js";
import { appendWallSelectedInspector } from "./sandboxWallInspector.js";
import { appendSelectedPropInspector } from "./sandboxPropSelectedInspector.js";
import { appendActionRow, appendEditorHint, appendAxisNumberFields, appendSelectField } from "../../UI/paramFields.js";
import { listFloorBeltKindOptions } from "../../Sandbox/sandboxCapabilities.js";
function appendFloorBeltSelectedInspector(body, controller, selectedFloorBelt) {
    appendEditorHint(body, `${selectedFloorBelt.kindLabel} · facing ${selectedFloorBelt.facingLabel}. Change type, col/row, or rotation below. Move is blocked when the target has a wall or belt.`);
    appendSelectField(body, "Type", {
        value: String(selectedFloorBelt.kind),
        options: listFloorBeltKindOptions().map((option) => ({ value: String(option.kind), label: option.label })),
        onChange: (value) => {
            controller.setSelectedFloorBeltKind(Number(value));
        },
    });
    appendAxisNumberFields(body, {
        Col: {
            value: selectedFloorBelt.col,
            step: 1,
            onChange: (col) => {
                controller.moveSelectedFloorBeltTo(col, selectedFloorBelt.row);
            },
        },
        Row: {
            value: selectedFloorBelt.row,
            step: 1,
            onChange: (row) => {
                controller.moveSelectedFloorBeltTo(selectedFloorBelt.col, row);
            },
        },
    });
    appendActionRow(body, [
        { label: "Rotate left", onClick: () => controller.rotateSelectedFloorBelt(-1) },
        { label: "Rotate right", onClick: () => controller.rotateSelectedFloorBelt(1) },
    ]);
    appendActionRow(body, [{ label: "Delete belt", onClick: () => controller.deleteSelectedFloorCell() }]);
}
const INSPECTOR_UI = {
    props(body, state, controller, data) {
        const count = data.ids.length;
        appendEditorHint(body, `${count} props selected.`);
        appendActionRow(body, [{ label: `Delete ${count} props`, onClick: () => controller.deleteSelectedProps() }]);
    },
    prop(body, state, controller, data, refreshPanel) {
        appendSelectedPropInspector(body, state, controller, data, refreshPanel);
    },
    floorBelt(body, state, controller, data) {
        appendFloorBeltSelectedInspector(body, controller, data);
    },
    voxel(body, state, controller, data) {
        appendWallSelectedInspector(body, state, controller, { voxel: data });
    },
    rail(body, state, controller, data) {
        appendWallSelectedInspector(body, state, controller, { rail: data });
    },
};
for (const key of PLACEABLE_INSPECTOR_KINDS) if (!INSPECTOR_UI[key]) throw new Error(`Missing inspector UI for placeable kind: ${key}`);
if (!INSPECTOR_UI.props) throw new Error("Missing inspector UI for placeable kind: props");
export function appendSelectionInspector(body, state, controller, inspector, refreshPanel) {
    INSPECTOR_UI[inspector.kind](body, state, controller, inspector.data, refreshPanel);
}
