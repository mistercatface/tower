import { Project } from "ts-morph";
import path from "path";
import fs from "fs";

const project = new Project();
project.addSourceFilesAtPaths("Libraries/**/*.js");
project.addSourceFilesAtPaths("tests/**/*.js");
project.addSourceFilesAtPaths("scripts/**/*.js");
project.addSourceFilesAtPaths("Workers/**/*.js");

const moves = [
    { src: "Libraries/Pathfinding/HpaPathWorker.js", dest: "Libraries/Navigation/HpaPathWorker.js" },
    { src: "Libraries/Pathfinding/hpaWorkerSab.js", dest: "Libraries/Navigation/hpaWorkerSab.js" },
    { src: "Libraries/Workers/Navigation/HpaWorkerEntry.js", dest: "Libraries/Navigation/HpaWorkerEntry.js" },
    { src: "Libraries/Workers/Navigation/FlowFieldWorkerEntry.js", dest: "Libraries/Navigation/FlowFieldWorkerEntry.js" },
    { src: "Libraries/Workers/PathfindingWorkerClient.js", dest: "Libraries/Navigation/PathfindingWorkerClient.js" }
];

for (const { src, dest } of moves) {
    const sf = project.getSourceFile(src);
    if (sf) {
        sf.moveToDirectory("Libraries/Navigation");
        // moveToDirectory just changes its directory, it retains its basename.
        // Wait, if we use sf.move(dest) it moves it and renames it.
        // sf.move(dest) is better to be safe.
    }
}

for (const { src, dest } of moves) {
    const sf = project.getSourceFile(path.basename(src)); // wait, finding it after move is tricky
}

project.saveSync();
console.log("Moved files successfully.");
