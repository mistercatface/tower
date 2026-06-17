import { PLACEABLE_INSPECTOR_KINDS } from "../../Sandbox/sandboxScenePlaceables.js";
import { appendFloorBeltSelectedInspector, appendPowerSourceSelectedInspector } from "./sandboxFloorInspector.js";
import { appendRoomNodeSelectedInspector } from "./sandboxRoomSelectedInspector.js";
import { appendForcefieldSelectedInspector, appendRoomLinkCorridorInspector, appendWallSelectedInspector } from "./sandboxWallInspector.js";
import { appendSelectedPropInspector } from "./sandboxPropSelectedInspector.js";
import { appendActionRow, appendEditorHint } from "../../UI/paramFields.js";
const INSPECTOR_UI = {
    props(body, state, controller, data) {
        const count = data.ids.length;
        appendEditorHint(body, `${count} props selected. Drag on empty space to box-select, or click one prop to select only that.`);
        appendActionRow(body, [{ label: `Delete ${count} props`, onClick: () => controller.deleteSelectedProps() }]);
    },
    prop(body, state, controller, data, refreshPanel) {
        appendSelectedPropInspector(body, state, controller, data, refreshPanel);
    },
    floorBelt(body, state, controller, data) {
        appendFloorBeltSelectedInspector(body, controller, data);
    },
    powerSource(body, state, controller, data) {
        appendPowerSourceSelectedInspector(body, controller, data);
    },
    voxel(body, state, controller, data) {
        appendWallSelectedInspector(body, state, controller, { voxel: data });
    },
    rail(body, state, controller, data) {
        appendWallSelectedInspector(body, state, controller, { rail: data });
    },
    forcefield(body, state, controller, data) {
        appendForcefieldSelectedInspector(body, controller, data, { promptReselect: !controller.isWallPlaceMode() });
    },
    roomNode(body, state, controller, data) {
        appendRoomNodeSelectedInspector(body, state, controller, data);
    },
    roomLink(body, state, controller, data) {
        appendRoomLinkCorridorInspector(body, state, data, controller);
    },
};
for (const key of PLACEABLE_INSPECTOR_KINDS) if (!INSPECTOR_UI[key]) throw new Error(`Missing inspector UI for placeable kind: ${key}`);
if (!INSPECTOR_UI.props) throw new Error("Missing inspector UI for placeable kind: props");
export function appendSelectionInspector(body, state, controller, inspector, refreshPanel) {
    INSPECTOR_UI[inspector.kind](body, state, controller, inspector.data, refreshPanel);
}
