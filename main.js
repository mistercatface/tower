import { createEditorApp } from "./Apps/Editor/engine.js";
import { parseGameLaunchQuery } from "./Libraries/Game/parseGameLaunchQuery.js";

createEditorApp({ gameLaunchId: parseGameLaunchQuery() });
