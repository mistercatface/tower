globalThis.OffscreenCanvas = class {
    constructor(width, height) {
        this.width = width;
        this.height = height;
    }
    getContext() {
        return { canvas: this };
    }
};

const { buildSandboxMazeSceneDoc } = await import("../Libraries/Sandbox/sandboxMazeScene.js");
const { parseSandboxSceneSnapshot } = await import("../Libraries/Sandbox/sandboxSceneSnapshot.js");
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const doc = buildSandboxMazeSceneDoc();
parseSandboxSceneSnapshot(doc);
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../Libraries/Sandbox/conveyorMaze.snapshot.json");
fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
