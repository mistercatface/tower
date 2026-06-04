export function renderMapLabView(ctx, width, height, world, camera, options, selectedNodeId) {
    ctx.save();
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, width, height);
    
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    
    if (options.showGridBounds && world.obstacleGrid) {
        const grid = world.obstacleGrid;
        if (grid.minX !== undefined && grid.maxX !== undefined) {
            ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
            ctx.lineWidth = 10 / camera.zoom;
            ctx.setLineDash([20, 20]);
            ctx.strokeRect(grid.minX, grid.minY, grid.maxX - grid.minX, grid.maxY - grid.minY);
            ctx.setLineDash([]);
        }
    }
    
    if (options.showRoomZones) {
        for (const node of world.mapNodes) {
            const coords = world.getNodeCombatCoords(node);
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, 540, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            ctx.lineWidth = 2 / camera.zoom;
            ctx.stroke();
        }
    }
    
    if (options.showNodes) {
        // Draw connections
        ctx.lineWidth = 4 / camera.zoom;
        for (const node of world.mapNodes) {
            const coordsA = world.getNodeCombatCoords(node);
            for (const targetId of node.connections) {
                const targetNode = world.getMapNode(targetId);
                if (!targetNode) continue;
                const coordsB = world.getNodeCombatCoords(targetNode);
                
                ctx.beginPath();
                ctx.moveTo(coordsA.x, coordsA.y);
                ctx.lineTo(coordsB.x, coordsB.y);
                ctx.strokeStyle = "rgba(85, 85, 85, 0.4)";
                ctx.stroke();
            }
        }
    }
    
    if (options.showWalls) {
        for (const seg of world.walls) {
            if (seg.isDead) continue;
            
            ctx.save();
            ctx.translate(seg.x, seg.y);
            ctx.rotate(seg.angle);
            
            const theme = seg.theme || { r: 120, g: 120, b: 120 };
            ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.8)`;
            
            const halfSize = seg.size / 2;
            const thickness = 20; // visual representation of wall thickness
            ctx.fillRect(-halfSize, -thickness/2, seg.size, thickness);
            
            ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 1)`;
            ctx.lineWidth = 1 / camera.zoom;
            ctx.strokeRect(-halfSize, -thickness/2, seg.size, thickness);
            
            ctx.restore();
        }
    }
    
    if (options.showNodes) {
        // Draw nodes
        for (const node of world.mapNodes) {
            const coords = world.getNodeCombatCoords(node);
            
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, 30 / camera.zoom, 0, Math.PI * 2);
            
            const themeColor = node.wallTheme ? `rgb(${node.wallTheme.r}, ${node.wallTheme.g}, ${node.wallTheme.b})` : "#555";
            ctx.fillStyle = themeColor;
            
            if (node.id === selectedNodeId) {
                ctx.lineWidth = 8 / camera.zoom;
                ctx.strokeStyle = "#fff";
            } else {
                ctx.lineWidth = 3 / camera.zoom;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            }
            
            ctx.fill();
            ctx.stroke();
            
            // Draw text
            if (camera.zoom > 0.05) {
                ctx.fillStyle = "#fff";
                ctx.font = `bold ${20 / camera.zoom}px Inter, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(node.id.toString(), coords.x, coords.y);
            }
        }
    }
    
    ctx.restore();
}
