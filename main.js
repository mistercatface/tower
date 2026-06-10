import { createGame } from "./Core/createGame.js";
import { loadGameDefinition } from "./Core/gameRegistry.js";
import { loadAssemblyManifests } from "./Libraries/Sandbox/assemblies/loadAssemblyManifests.js";
const EDITOR_GAME_ALIASES = new Set(["editor", "tilelab"]);
/** @param {string} [search] */
function shouldBootEditor(search = typeof window !== "undefined" ? window.location.search : "") {
    const gameId = new URLSearchParams(search).get("game");
    return !gameId || EDITOR_GAME_ALIASES.has(gameId);
}
loadAssemblyManifests()
    .then(() => import("./Libraries/Props/loadPropAssets.js"))
    .then(({ loadPropAssets }) => {
        loadPropAssets();
        if (shouldBootEditor()) return import("./Apps/Editor/createEditorApp.js").then(({ createEditorApp }) => createEditorApp());
        const gameId = new URLSearchParams(window.location.search).get("game");
        return loadGameDefinition(/** @type {string} */ (gameId)).then(createGame);
    });
