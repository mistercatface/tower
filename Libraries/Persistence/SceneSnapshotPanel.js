import { appendActionRow, appendEditorHint } from "../UI/paramFields.js";
import { setFormFieldName } from "../UI/Component.js";
export function mountSceneSnapshotPanel(container, controller) {
    appendEditorHint(container, "Copy/paste sandbox layout: props, walls, belts, power sources. Replace clears the current sandbox first.");
    const textarea = document.createElement("textarea");
    textarea.className = "editor-export-area";
    setFormFieldName(textarea, "sceneJsonExport");
    textarea.rows = 10;
    textarea.spellcheck = false;
    container.appendChild(textarea);
    appendActionRow(container, [
        {
            label: "Export",
            onClick: () => {
                textarea.value = controller.exportSceneSnapshot();
            },
        },
        {
            label: "Copy",
            onClick: async () => {
                if (!textarea.value) textarea.value = controller.exportSceneSnapshot();
                await navigator.clipboard.writeText(textarea.value);
            },
        },
        {
            label: "Load (replace)",
            onClick: () => {
                if (!textarea.value.trim()) return;
                if (!window.confirm("Replace the current sandbox with this JSON?")) return;
                try {
                    controller.importSceneSnapshot(textarea.value);
                    controller.session.sync();
                } catch (err) {
                    window.alert(err instanceof Error ? err.message : String(err));
                }
            },
        },
    ]);
}
