import { TileSurfaceWorker } from "./TileSurfaceWorker.js";
const worker = new TileSurfaceWorker();
self.onmessage = (e) => worker.onMessage(e);
