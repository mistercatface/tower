import { createEditorApp } from "./Apps/Editor/engine.js";
import { parseGameLaunchQuery } from "./Libraries/Game/gameLaunch.js";

createEditorApp({ gameLaunchId: parseGameLaunchQuery() });
