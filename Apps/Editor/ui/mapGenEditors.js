import { appendMapGenEditor as appendMapGenEditorPanel, refreshMapGenPanelInputs } from "../../../Libraries/Sandbox/sandbox.js";
import { generateLabCaverns, generateLabRailCaverns, generateLabRailMaze, eraseLabWallsInBounds } from "../../../Libraries/Spatial/spatial.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
export { refreshMapGenPanelInputs };
export function appendMapGenEditor(parent, state, kind, onGenerated) {
    appendMapGenEditorPanel(parent, state, kind, {
        onGenerated,
        onPreviewChange: () => paintMapOverviewFrame(state),
        generateCaverns: () => generateLabCaverns(state),
        generateRails: () => generateLabRailCaverns(state),
        generateRailMaze: () => generateLabRailMaze(state),
        eraseWalls: () => eraseLabWallsInBounds(state),
    });
}
