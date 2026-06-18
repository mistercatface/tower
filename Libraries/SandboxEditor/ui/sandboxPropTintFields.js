import { getPropAsset } from "../../Props/PropCatalog.js";
import { clearPropTint, getPropTintHue, isPropTintable, resolvePropTintPickerHex, setPropTintFromPickerHex } from "../../Props/propTint.js";
import { appendCheckboxField, appendColorField, appendActionRow } from "../../UI/paramFields.js";
export function appendSpawnPropTintFields(body, controller, spawnId, refreshPanel) {
    const spawnAsset = getPropAsset(spawnId);
    if (!isPropTintable(spawnAsset)) return;
    appendCheckboxField(body, "Tint next spawn", {
        name: "spawnPropTintEnabled",
        checked: controller.isSpawnPropTintEnabled(),
        onChange: (enabled) => {
            controller.setSpawnPropTintEnabled(enabled);
            refreshPanel();
        },
    });
    if (!controller.isSpawnPropTintEnabled()) return;
    appendColorField(body, "Tint color", {
        value: controller.getSpawnPropTintHex(spawnAsset),
        onChange: (hex) => {
            controller.setSpawnPropTintHex(hex);
        },
    });
}
export function appendSelectedPropTintFields(body, selectedProp, refreshPanel) {
    const asset = getPropAsset(selectedProp.type);
    if (!isPropTintable(asset)) return;
    appendColorField(body, "Tint", {
        value: resolvePropTintPickerHex(selectedProp, asset),
        onChange: (hex) => {
            setPropTintFromPickerHex(selectedProp, hex);
        },
    });
    if (getPropTintHue(selectedProp) == null) return;
    appendActionRow(body, [
        {
            label: "Clear tint",
            onClick: () => {
                clearPropTint(selectedProp);
                refreshPanel();
            },
        },
    ]);
}
