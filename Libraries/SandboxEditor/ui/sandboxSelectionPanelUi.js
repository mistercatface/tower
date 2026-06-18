import { sandboxTagFilterLabel } from "./sandboxPlacePalette.js";
import { appendActionRow, appendEditorHint, appendInstanceList } from "../../UI/paramFields.js";
export function appendSandboxSelectionPanel(body, controller, refreshPanel) {
    const selection = controller.getSelection();
    const filter = controller.getSelectionTagFilter();
    const selectedProps = controller.listSelectedPropEntries();
    appendEditorHint(body, "Shift+drag to box-select. Ctrl+click a prop to add or remove it from the selection.");
    const actions = [
        {
            label: filter === "all" ? "Select all props" : `Select all ${sandboxTagFilterLabel(filter)}`,
            onClick: () => {
                controller.selectAllPropsWithTagFilter(filter);
                refreshPanel();
            },
        },
    ];
    if (selection?.kind === "prop" && selectedProps.length > 0)
        actions.push({
            label: filter === "all" ? "Filter selection" : `Filter selection to ${sandboxTagFilterLabel(filter)}`,
            onClick: () => {
                controller.filterPropSelectionToTag(filter);
                refreshPanel();
            },
        });
    appendActionRow(body, actions);
    appendInstanceList(
        body,
        selectedProps.map((entry) => ({
            label: entry.label,
            selected: true,
            onSelect: () => {
                controller.select({ kind: "prop", ids: [entry.id] });
                refreshPanel();
            },
            onRemove: () => {
                controller.removePropFromSelection(entry.id);
                refreshPanel();
            },
            onDelete: () => {
                controller.deletePropById(entry.id);
                refreshPanel();
            },
        })),
        selection?.kind === "prop" ? "No props in selection." : "Select props on the map.",
    );
}
