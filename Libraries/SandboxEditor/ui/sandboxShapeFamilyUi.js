import {
    applyAssetDefaultVisualOverride,
    clearPropVisualOverride,
    getPropVisualBrightness,
    resolvePickerHex,
    setPropVisualBrightness,
    setPropVisualTint,
    stampPropVisualOverride,
} from "../../Color/visualOverride.js";
import { getCirclePropRadius, setCirclePropRadius } from "../../Props/propScale.js";
import { applyPropBoxFootprint, propFootprintHalfExtents } from "../../Props/propStrategy.js";
import { getPropAsset, formatSandboxSpawnLabel } from "../../Props/PropCatalog.js";
import {
    BLOCK_SPAWN_PRESET_OPTIONS,
    assetDefaultBallRadius,
    blockPresetUsesResizableFootprint,
    isBallFamilyAsset,
    isBlockFamilyAsset,
    resolveBlockPresetForAsset,
} from "../../Sandbox/sandboxShapeFamilies.js";
import { appendActionRow, appendColorField, appendEditorSubhead, appendNumberField, appendSelectField } from "../../UI/paramFields.js";
import { BALL_TINT_PRESETS } from "../../Color/tintPresets.js";
function brightnessToPercent(brightness) {
    return Math.round(brightness * 100);
}
function percentToBrightness(percent) {
    return percent / 100;
}
import { markLabViewDirty } from "../../../Apps/Editor/ui/preview.js";

function appendTintPresetRow(body, activeHex, onPick) {
    const row = document.createElement("div");
    row.className = "param-tint-presets";
    for (let i = 0; i < BALL_TINT_PRESETS.length; i++) {
        const preset = BALL_TINT_PRESETS[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "param-tint-preset";
        btn.style.backgroundColor = preset.hex;
        btn.title = preset.label;
        btn.setAttribute("aria-label", preset.label);
        btn.addEventListener("click", () => {
            onPick(preset.hex);
            markLabViewDirty();
        });
        row.appendChild(btn);
    }
    body.appendChild(row);
}

function appendCoatFields(body, { tint, brightness, onTintChange, onBrightnessChange, showPresets = false }) {
    appendColorField(body, "Tint", {
        value: tint,
        onChange: (hex) => {
            onTintChange(hex);
            markLabViewDirty();
        },
    });
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
    if (showPresets) appendTintPresetRow(body, tint, onTintChange);
}
export function appendBallSpawnFields(body, controller, spawnAsset) {
    appendNumberField(body, "Radius", { value: controller.getSpawnBallRadius(spawnAsset), step: 1, min: 1, max: 32, onChange: (radius) => controller.setSpawnBallRadius(radius) });
    appendCoatFields(body, {
        tint: controller.getSpawnVisualOverrideTint(spawnAsset),
        brightness: controller.getSpawnVisualOverrideBrightness(),
        onTintChange: (hex) => controller.setSpawnVisualOverrideTint(hex),
        onBrightnessChange: (brightness) => controller.setSpawnVisualOverrideBrightness(brightness),
        showPresets: true,
    });
}
export function appendBlockSpawnFields(body, controller) {
    const presetId = controller.getSpawnBlockPresetId();
    appendSelectField(body, "Preset", {
        value: presetId,
        options: BLOCK_SPAWN_PRESET_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
        onChange: (value) => controller.setSpawnBlockPresetId(value),
    });
    if (blockPresetUsesResizableFootprint(presetId)) {
        appendNumberField(body, "Width", { value: controller.getSpawnBoxWidth(), step: 1, min: 6, max: 128, onChange: (width) => controller.setSpawnBoxWidth(width) });
        appendNumberField(body, "Height", { value: controller.getSpawnBoxHeight(), step: 1, min: 6, max: 128, onChange: (height) => controller.setSpawnBoxHeight(height) });
    }
    const coatAsset = getPropAsset(presetId);
    appendCoatFields(body, {
        tint: controller.getSpawnVisualOverrideTint(coatAsset),
        brightness: controller.getSpawnVisualOverrideBrightness(),
        onTintChange: (hex) => controller.setSpawnVisualOverrideTint(hex),
        onBrightnessChange: (brightness) => controller.setSpawnVisualOverrideBrightness(brightness),
        showPresets: true,
    });
}
export function appendShapeFamilySpawnFields(body, controller, spawnId) {
    const spawnAsset = getPropAsset(spawnId);
    if (isBallFamilyAsset(spawnAsset)) appendBallSpawnFields(body, controller, spawnAsset);
    else if (isBlockFamilyAsset(spawnAsset)) appendBlockSpawnFields(body, controller);
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
        onTintChange: (hex) => setPropVisualTint(selectedProp, hex),
        onBrightnessChange: (brightness) => setPropVisualBrightness(selectedProp, brightness),
    });
    appendActionRow(body, [
        {
            label: "Reset coat",
            onClick: () => {
                clearPropVisualOverride(selectedProp);
                applyAssetDefaultVisualOverride(selectedProp, asset);
                markLabViewDirty();
            },
        },
    ]);
}
export function appendBlockSelectedFields(body, selectedProp, asset) {
    appendEditorSubhead(body, formatSandboxSpawnLabel(resolveBlockPresetForAsset(asset)));
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
        onTintChange: (hex) => setPropVisualTint(selectedProp, hex),
        onBrightnessChange: (brightness) => setPropVisualBrightness(selectedProp, brightness),
    });
    appendActionRow(body, [
        {
            label: "Reset coat",
            onClick: () => {
                clearPropVisualOverride(selectedProp);
                applyAssetDefaultVisualOverride(selectedProp, asset);
                markLabViewDirty();
            },
        },
    ]);
}
export function appendShapeFamilySelectedFields(body, selectedProp) {
    const asset = getPropAsset(selectedProp.type);
    if (isBallFamilyAsset(asset)) appendBallSelectedFields(body, selectedProp, asset);
    else if (isBlockFamilyAsset(asset)) appendBlockSelectedFields(body, selectedProp, asset);
}
