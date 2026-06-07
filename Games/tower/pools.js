import { ObjectPool } from "../../Libraries/DataStructures/ObjectPool.js";
import { Projectile } from "./entities/Projectile.js";

export const towerPools = {
    projectiles: new ObjectPool(null, 100),
};

towerPools.projectiles.createFn = () => new Projectile();
