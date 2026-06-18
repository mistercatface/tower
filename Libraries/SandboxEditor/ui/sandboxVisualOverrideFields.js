import { assetHasTintableColors, clearPropVisualOverride, getPropVisualTint, resolvePickerHex, setPropVisualTint } from "../../Color/visualOverride.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { appendActionRow, appendCheckboxField, appendColorField } from "../../UI/paramFields.js";
export function appendSpawnVisualOverrideFields(body, controller, spawnId, refreshPanel) {
    const spawnAsset = getPropAsset(spawnId);
    if (!assetHasTintableColors(spawnAsset)) return;
    appendCheckboxField(body, "Tint next spawn", {
        checked: controller.isSpawnVisualOverrideEnabled(),
        onChange: (enabled) => {
            controller.setSpawnVisualOverrideEnabled(enabled);
            refreshPanel();
        },
    });
    if (!controller.isSpawnVisualOverrideEnabled()) return;
    appendColorField(body, "Spawn tint", {
        value: controller.getSpawnVisualOverrideTint(spawnAsset),
        onChange: (hex) => {
            controller.setSpawnVisualOverrideTint(hex);
        },
    });
}
export function appendSelectedVisualOverrideFields(body, selectedProp, refreshPanel) {
    const asset = getPropAsset(selectedProp.type);
    if (!assetHasTintableColors(asset)) return;
    appendColorField(body, "Tint", {
        value: resolvePickerHex(selectedProp, asset),
        onChange: (hex) => {
            setPropVisualTint(selectedProp, hex);
            refreshPanel();
        },
    });
    if (getPropVisualTint(selectedProp) != null)
        appendActionRow(body, [
            {
                label: "Clear tint",
                onClick: () => {
                    clearPropVisualOverride(selectedProp);
                    refreshPanel();
                },
            },
        ]);
}
