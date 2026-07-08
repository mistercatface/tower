const fs = require("fs");
const files = [
    "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation/HpaPathWorker.js",
    "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation/hpaWorkerSab.js",
    "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation/HpaWorkerEntry.js",
    "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation/FlowFieldWorkerEntry.js",
    "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation/PathfindingWorkerClient.js"
];
for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, "utf8");
    text = text.replace(/\.\.\/\.\.\/Navigation\/navigation\.js/g, "./navigation.js");
    text = text.replace(/\.\.\/\.\.\/Spatial\/spatial\.js/g, "../Spatial/spatial.js");
    text = text.replace(/\.\.\/\.\.\/Pathfinding\/hpaWorkerSab\.js/g, "./hpaWorkerSab.js");
    text = text.replace(/\.\.\/Pathfinding\/hpaWorkerSab\.js/g, "./hpaWorkerSab.js");
    text = text.replace(/\.\.\/Workers\/PathfindingWorkerClient\.js/g, "./PathfindingWorkerClient.js");
    text = text.replace(/\.\.\/\.\.\/Workers\/PathfindingWorkerClient\.js/g, "./PathfindingWorkerClient.js");
    fs.writeFileSync(file, text);
}
console.log("Fixed worker imports");
