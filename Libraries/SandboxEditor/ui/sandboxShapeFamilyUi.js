import { clearPropVisualOverride, getPropVisualBrightness, resolvePickerHex, sampleAssetBaseTintHex, setPropVisualBrightness, setPropVisualTint } from "../../Color/visualOverride.js";
import { getCirclePropRadius, setCirclePropRadius } from "../../Props/propScale.js";
import { applyCrossPinwheelFootprint, applyPropBoxFootprint, propFootprintHalfExtents } from "../../Props/propStrategy.js";
import { assetDefaultBallRadius, blockPresetUsesResizableFootprint, isBallFamilyAsset, isBlockFamilyAsset } from "../../Sandbox/sandboxShapeFamilies.js";
import { appendActionRow, appendColorField, appendNumberField } from "../../UI/paramFields.js";
import { markLabViewDirty } from "../../../Apps/Editor/ui/preview.js";
import propCatalog from "../../../Assets/props/index.js";
function brightnessToPercent(brightness) {
    return Math.round(brightness * 100);
}
function percentToBrightness(percent) {
    return percent / 100;
}
function appendCoatFields(body, { tint, brightness, onTintChange, onBrightnessChange }) {
    appendColorField(body, "Tint", { value: tint, onChange: onTintChange });
    appendNumberField(body, "Brightness %", {
        value: brightnessToPercent(brightness),
        step: 5,
        min: 25,
        max: 200,
        onChange: (percent) => {
            onBrightnessChange(percentToBrightness(percent));
            markLabViewDirty();
        },
    });
}
export function appendBallSpawnFields(body, controller, spawnAsset) {
    appendNumberField(body, "Radius", { value: controller.getSpawnBallRadius(spawnAsset), step: 1, min: 1, max: 32, onChange: (radius) => controller.setSpawnBallRadius(radius) });
    appendCoatFields(body, {
        tint: controller.getSpawnVisualOverrideTint(spawnAsset),
        brightness: controller.getSpawnVisualOverrideBrightness(),
        onTintChange: (hex) => {
            controller.setSpawnVisualOverrideTint(hex);
            markLabViewDirty();
        },
        onBrightnessChange: (brightness) => {
            controller.setSpawnVisualOverrideBrightness(brightness);
            markLabViewDirty();
        },
    });
}
export function appendBlockSpawnFields(body, controller, spawnAsset) {
    if (blockPresetUsesResizableFootprint(spawnAsset.id)) {
        appendNumberField(body, "Width", { value: controller.getSpawnBoxWidth(), step: 1, min: 6, max: 128, onChange: (width) => controller.setSpawnBoxWidth(width) });
        appendNumberField(body, "Height", { value: controller.getSpawnBoxHeight(), step: 1, min: 6, max: 128, onChange: (height) => controller.setSpawnBoxHeight(height) });
    }
    appendCoatFields(body, {
        tint: controller.getSpawnVisualOverrideTint(spawnAsset),
        brightness: controller.getSpawnVisualOverrideBrightness(),
        onTintChange: (hex) => {
            controller.setSpawnVisualOverrideTint(hex);
            markLabViewDirty();
        },
        onBrightnessChange: (brightness) => {
            controller.setSpawnVisualOverrideBrightness(brightness);
            markLabViewDirty();
        },
    });
}
export function appendCrossPinwheelSpawnFields(body, controller) {
    appendNumberField(body, "Cross length", { value: controller.getSpawnCrossLength(), step: 2, min: 8, max: 128, onChange: (val) => controller.setSpawnCrossLength(val) });
    appendNumberField(body, "Cross thickness", { value: controller.getSpawnCrossThickness(), step: 1, min: 2, max: 64, onChange: (val) => controller.setSpawnCrossThickness(val) });
}
export function appendShapeFamilySpawnFields(body, controller, spawnId) {
    const spawnAsset = propCatalog[spawnId];
    if (spawnId === "cross_pinwheel") appendCrossPinwheelSpawnFields(body, controller);
    else if (isBallFamilyAsset(spawnAsset)) appendBallSpawnFields(body, controller, spawnAsset);
    else if (isBlockFamilyAsset(spawnAsset)) appendBlockSpawnFields(body, controller, spawnAsset);
}
export function appendBallSelectedFields(body, selectedProp, asset) {
    appendNumberField(body, "Radius", {
        value: getCirclePropRadius(selectedProp) ?? assetDefaultBallRadius(asset),
        step: 1,
        min: 1,
        max: 32,
        onChange: (radius) => {
            setCirclePropRadius(selectedProp, radius);
            markLabViewDirty();
        },
    });
    appendCoatFields(body, {
        tint: resolvePickerHex(selectedProp, asset),
        brightness: getPropVisualBrightness(selectedProp),
        onTintChange: (hex) => {
            setPropVisualTint(selectedProp, hex);
            markLabViewDirty();
        },
        onBrightnessChange: (brightness) => {
            setPropVisualBrightness(selectedProp, brightness);
            markLabViewDirty();
        },
    });
    appendActionRow(body, [
        {
            label: "Reset coat",
            onClick: () => {
                clearPropVisualOverride(selectedProp);
                markLabViewDirty();
            },
        },
    ]);
}
export function appendBlockSelectedFields(body, selectedProp, asset) {
    if (blockPresetUsesResizableFootprint(asset.id)) {
        const span = propFootprintHalfExtents(selectedProp);
        appendNumberField(body, "Width", {
            value: Math.round(span.x * 2),
            step: 1,
            min: 6,
            max: 128,
            onChange: (width) => {
                const next = propFootprintHalfExtents(selectedProp);
                applyPropBoxFootprint(selectedProp, width / 2, next.y);
                markLabViewDirty();
            },
        });
        appendNumberField(body, "Height", {
            value: Math.round(span.y * 2),
            step: 1,
            min: 6,
            max: 128,
            onChange: (height) => {
                const next = propFootprintHalfExtents(selectedProp);
                applyPropBoxFootprint(selectedProp, next.x, height / 2);
                markLabViewDirty();
            },
        });
    }
    appendCoatFields(body, {
        tint: resolvePickerHex(selectedProp, asset),
        brightness: getPropVisualBrightness(selectedProp),
        onTintChange: (hex) => {
            setPropVisualTint(selectedProp, hex);
            markLabViewDirty();
        },
        onBrightnessChange: (brightness) => {
            setPropVisualBrightness(selectedProp, brightness);
            markLabViewDirty();
        },
    });
    appendActionRow(body, [
        {
            label: "Reset coat",
            onClick: () => {
                clearPropVisualOverride(selectedProp);
                markLabViewDirty();
            },
        },
    ]);
}
export function appendCrossPinwheelSelectedFields(body, selectedProp, asset) {
    const length = selectedProp.crossLength ?? 32;
    const thickness = selectedProp.crossThickness ?? 8;
    appendNumberField(body, "Cross length", {
        value: length,
        step: 2,
        min: 8,
        max: 128,
        onChange: (val) => {
            applyCrossPinwheelFootprint(selectedProp, val, selectedProp.crossThickness ?? 8);
            markLabViewDirty();
        },
    });
    appendNumberField(body, "Cross thickness", {
        value: thickness,
        step: 1,
        min: 2,
        max: 64,
        onChange: (val) => {
            applyCrossPinwheelFootprint(selectedProp, selectedProp.crossLength ?? 32, val);
            markLabViewDirty();
        },
    });
    appendCoatFields(body, {
        tint: resolvePickerHex(selectedProp, asset),
        brightness: getPropVisualBrightness(selectedProp),
        onTintChange: (hex) => {
            setPropVisualTint(selectedProp, hex);
            markLabViewDirty();
        },
        onBrightnessChange: (brightness) => {
            setPropVisualBrightness(selectedProp, brightness);
            markLabViewDirty();
        },
    });
    appendActionRow(body, [
        {
            label: "Reset coat",
            onClick: () => {
                clearPropVisualOverride(selectedProp);
                markLabViewDirty();
            },
        },
    ]);
}
export function appendShapeFamilySelectedFields(body, selectedProp) {
    if (!selectedProp) return;
    const asset = propCatalog[selectedProp.type];
    if (selectedProp.type === "cross_pinwheel") appendCrossPinwheelSelectedFields(body, selectedProp, asset);
    else if (isBallFamilyAsset(asset)) appendBallSelectedFields(body, selectedProp, asset);
    else if (isBlockFamilyAsset(asset)) appendBlockSelectedFields(body, selectedProp, asset);
}
