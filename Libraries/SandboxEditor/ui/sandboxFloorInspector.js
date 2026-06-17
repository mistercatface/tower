import { listFloorBeltKindOptions } from "../../Sandbox/sandboxCapabilities.js";
import { appendActionRow, appendAxisNumberFields, appendCheckboxField, appendEditorHint, appendSelectField } from "../../UI/paramFields.js";
export function appendPowerSourceSelectedInspector(body, controller, selectedPowerSource) {
    appendEditorHint(body, "Passage power source. Wire floor buttons to this cell; lasers arm through connected chains.");
    appendCheckboxField(body, "Default energized", {
        name: "powerSourceDefaultPowered",
        checked: selectedPowerSource.defaultPowered,
        onChange: (checked) => {
            controller.setSelectedPassagePowerSourceDefaultPowered(checked);
        },
    });
    appendActionRow(body, [{ label: "Delete power source", onClick: () => controller.deleteSelectedFloorCell() }]);
}
export function appendFloorBeltSelectedInspector(body, controller, selectedFloorBelt) {
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
