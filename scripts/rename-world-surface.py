#!/usr/bin/env python3
"""One-shot rename pass for world-surface naming cleanup."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS = [
    ("installGameFloorProfileProvider", "installGameSurfaceProfileProvider"),
    ("isFloorProfileProviderInstalled", "isSurfaceProfileProviderInstalled"),
    ("getFloorProfileProvider", "getSurfaceProfileProvider"),
    ("installFloorProfileProvider", "installSurfaceProfileProvider"),
    ("setFloorProfileProvider", "setSurfaceProfileProvider"),
    ("FloorProfileProvider", "SurfaceProfileProvider"),
    ("listShippedFloorProfileIds", "listShippedSurfaceProfileIds"),
    ("registerRuntimeFloorProfile", "registerRuntimeSurfaceProfile"),
    ("resolveFloorTextureProfileId", "resolveSurfaceProfileId"),
    ("defaultFloorProceduralProfileId", "defaultSurfaceProfileId"),
    ("floorProceduralProfiles", "surfaceProceduralProfiles"),
    ("getFloorTextureProfileIdForCoords", "resolveSurfaceProfileAtCoords"),
    ("getFloorTextureProfileId", "resolveSurfaceProfileAtPlayer"),
    ("syncFloorTextureProfile", "syncSurfaceProfile"),
    ("buildFloorChunkBakePayload", "buildGroundChunkBakePayload"),
    ("createFloorChunkBakePayload", "createGroundChunkBakePayload"),
    ("isFloorChunkAnimationEnabled", "isGroundChunkAnimationEnabled"),
    ("getFloorChunkAnimationInfo", "getGroundChunkAnimationInfo"),
    ("isWallFaceAnimationEnabled", "isWallAtlasAnimationEnabled"),
    ("getWallFaceAnimationInfo", "getWallAtlasAnimationInfo"),
    ("floorChunkCachePrefix", "groundChunkCachePrefix"),
    ("invalidateWallSurfaceKeyMemos", "invalidateWallAtlasKeyMemos"),
    ("getWallCacheInfo", "getWallAtlasCacheInfo"),
    ("buildWallCacheKey", "buildWallAtlasCacheKey"),
    ("requestWallFaceBake", "requestWallAtlasBake"),
    ("requestFloorChunkBake", "requestGroundChunkBake"),
    ("bakeWallFaceCanvases", "bakeWallAtlasCanvases"),
    ("bakeWallFaceCanvas", "bakeWallAtlasCanvas"),
    ("bakeFloorChunkCanvases", "bakeGroundChunkCanvases"),
    ('"bakeWallFace"', '"bakeWallAtlas"'),
    ('"bakeFloorChunk"', '"bakeGroundChunk"'),
    ("ensureWallFace", "ensureWallAtlas"),
    ("getChunkCanvas", "getGroundChunkCanvas"),
    ("FloorTileSystem", "WorldSurfaceSystem"),
    ("FloorTilePainter", "WorldSurfacePainter"),
    ("floorTextureResolution", "WorldSurfaceResolution"),
    ("WallFaceTexture", "ProjectedWallDraw"),
    ("floorTextureProfile.js", "surfaceProfileResolver.js"),
    ("FloorBakeHelpers", "SurfaceBakeHelpers"),
    ("floorTileSettings", "worldSurfaceSettings"),
    ("floorTileSeed", "worldSurfaceSeed"),
    ("floorTextureProfileOverride", "surfaceProfileOverride"),
    ("floorTextureProfileId", "surfaceProfileId"),
    ("floorTiles", "worldSurfaces"),
    ("floorBake", "surfaceBake"),
    ("FloorBakeContext", "SurfaceBakeContext"),
    ("Render/Floor/", "Render/WorldSurface/"),
    ("Render\\Floor\\", "Render\\WorldSurface\\"),
    ("../Floor/", "../WorldSurface/"),
    ("../../Floor/", "../../WorldSurface/"),
    ("../../../Render/Floor/", "../../../Render/WorldSurface/"),
    ("../../Render/Floor/", "../../Render/WorldSurface/"),
    ("worldSurfaces.draw(", "worldSurfaces.drawGround("),
]

SKIP_DIRS = {".git", "node_modules", "scripts"}

def should_process(path: Path) -> bool:
    if path.suffix != ".js":
        return False
    return not any(part in SKIP_DIRS for part in path.parts)

def main():
    for path in ROOT.rglob("*.js"):
        if not should_process(path):
            continue
        text = path.read_text(encoding="utf-8")
        original = text
        for old, new in REPLACEMENTS:
            text = text.replace(old, new)
        if text != original:
            path.write_text(text, encoding="utf-8")
            print(f"updated {path.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
