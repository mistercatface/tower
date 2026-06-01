// --- tileFX.js ---
// Rendering Engine
// Turns data (Layers) into Pixels (Canvas).

const TextureCache = {};

// Helper: Deterministic Random based on input
// Ensures Tile(1,1) always looks the same, even with "random" effects
const seededRandom = (s) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
};

// --- DRAWING PRIMITIVES ---
const Primitives = {
    fill: (ctx, step, size) => {
        if (step.color) ctx.fillStyle = step.color;
        ctx.fillRect(0, 0, size, size);
    },
    
    // NEW: Gradient Rect (Metallic/Cylindrical look)
    gradient: (ctx, step, size) => {
        const x = (step.x || 0) * size;
        const y = (step.y || 0) * size;
        const w = (step.w || 1) * size;
        const h = (step.h || 1) * size;
        
        // vertical or horizontal gradient
        const g = step.dir === 'x' 
            ? ctx.createLinearGradient(x, y, x + w, y)
            : ctx.createLinearGradient(x, y, x, y + h);

        const c1 = step.color || '#000';
        const c2 = step.color2 || 'rgba(0,0,0,0)'; // Default fade out
        
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
    },

    rect: (ctx, step, size) => {
        let x = (step.x || 0) * size;
        let y = (step.y || 0) * size;
        let w = (step.w || 1) * size;
        let h = (step.h || 1) * size;

        // FEATURE: Roughness (Jitter)
        // Adds a worn, "hand-drawn" or "damaged" look
        if (step.roughness) {
            const seed = (x + y) * 12.34;
            x += (seededRandom(seed) - 0.5) * step.roughness * size;
            y += (seededRandom(seed + 1) - 0.5) * step.roughness * size;
            w += (seededRandom(seed + 2) - 0.5) * step.roughness * size;
            h += (seededRandom(seed + 3) - 0.5) * step.roughness * size;
        }

        ctx.beginPath();
        if (step.radius) {
            // NEW: Rounded Corners
            ctx.roundRect(x, y, w, h, step.radius * size);
        } else {
            ctx.rect(x, y, w, h);
        }

        if (step.fill !== false && step.color) { 
            ctx.fillStyle = step.color;
            ctx.fill();
        }
        if (step.stroke) {
            ctx.strokeStyle = step.stroke;
            ctx.lineWidth = (step.width || 1) * (size / 32);
            ctx.stroke();
        }
    },

    // NEW: Connected Path (Circuits/Wires)
    path: (ctx, step, size) => {
        if (!step.points || step.points.length < 2) return;
        
        ctx.lineWidth = (step.width || 1) * (size / 32);
        ctx.strokeStyle = step.stroke;
        ctx.lineCap = step.cap || 'butt'; // 'round' for wires
        ctx.lineJoin = step.join || 'miter';

        ctx.beginPath();
        const start = step.points[0];
        ctx.moveTo(start.x * size, start.y * size);

        for (let i = 1; i < step.points.length; i++) {
            const p = step.points[i];
            ctx.lineTo(p.x * size, p.y * size);
        }
        
        if (step.close) ctx.closePath();
        
        if (step.fill) {
            ctx.fillStyle = step.fill;
            ctx.fill();
        }
        ctx.stroke();
    },

    line: (ctx, step, size) => {
        ctx.lineWidth = (step.width || 1) * (size / 32);
        ctx.strokeStyle = step.stroke;
        
        // FEATURE: Dashed Lines
        if (step.dash) {
            ctx.setLineDash(step.dash.map(d => d * size));
        } else {
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo((step.x1 || 0) * size, (step.y1 || 0) * size);
        ctx.lineTo((step.x2 || 1) * size, (step.y2 || 1) * size);
        ctx.stroke();
        
        // Reset dash
        ctx.setLineDash([]);
    },

    circle: (ctx, step, size) => {
        const x = (step.x || 0.5) * size;
        const y = (step.y || 0.5) * size;
        const r = (step.radius || 0.4) * size;
        ctx.beginPath();
        if(r < 0) {
         console.log('whoops');
         return;
        }
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (step.fill) { ctx.fillStyle = step.fill; ctx.fill(); }
        if (step.stroke) { ctx.strokeStyle = step.stroke; ctx.lineWidth = (step.width||1); ctx.stroke(); }
    },

    // NEW: Rivets (Bolts along a perimeter)
    rivets: (ctx, step, size) => {
        const x = (step.x || 0) * size;
        const y = (step.y || 0) * size;
        const w = (step.w || 1) * size;
        const h = (step.h || 1) * size;
        const count = step.count || 4;
        const rivetSize = (step.size || 0.05) * size;
        
        ctx.fillStyle = step.color || 'rgba(0,0,0,0.4)';
        
        // Corners
        const drawPoint = (px, py) => {
            ctx.beginPath(); 
            ctx.arc(px, py, rivetSize, 0, Math.PI*2); 
            ctx.fill();
        };

        // Simple corner placement
        const inset = rivetSize * 1.5;
        drawPoint(x + inset, y + inset);
        drawPoint(x + w - inset, y + inset);
        drawPoint(x + w - inset, y + h - inset);
        drawPoint(x + inset, y + h - inset);
        
        // Midpoints if count > 4
        if (count > 4) {
            drawPoint(x + w/2, y + inset);
            drawPoint(x + w/2, y + h - inset);
            drawPoint(x + inset, y + h/2);
            drawPoint(x + w - inset, y + h/2);
        }
    },

    grid: (ctx, step, size) => {
        const gap = (step.gap || 0.25) * size;
        ctx.strokeStyle = step.stroke;
        ctx.lineWidth = (step.width || 1) * (size / 32);
        ctx.beginPath();
        for (let i = 0; i <= size; i += gap) {
            if (step.axis !== 'y') { ctx.moveTo(i, 0); ctx.lineTo(i, size); }
            if (step.axis !== 'x') { ctx.moveTo(0, i); ctx.lineTo(size, i); }
        }
        ctx.stroke();
    },

    stripes: (ctx, step, size) => {
        const gap = (step.gap || 0.2) * size;
        ctx.lineWidth = (step.stripeWidth || 0.1) * size;
        ctx.strokeStyle = step.stroke;
        ctx.save();
        ctx.beginPath();
        if (step.clip) ctx.rect(step.clip.x*size, step.clip.y*size, step.clip.w*size, step.clip.h*size);
        else ctx.rect(0, 0, size, size);
        ctx.clip();
        for (let i = -size; i < size * 2; i += gap) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
        }
        ctx.restore();
    },

    noise_grain: (ctx, step, size) => {
        const iData = ctx.getImageData(0, 0, size, size);
        const data = iData.data;
        const amount = step.intensity || 20;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] === 0) continue;
            // Use deterministic random based on pixel index + arbitrary seed
            const g = (seededRandom(i + (step.seed||0)) - 0.5) * amount;
            data[i] = Math.max(0, Math.min(255, data[i] + g));
            data[i+1] = Math.max(0, Math.min(255, data[i+1] + g));
            data[i+2] = Math.max(0, Math.min(255, data[i+2] + g));
        }
        ctx.putImageData(iData, 0, 0);
    },

    bevel: (ctx, step, size) => {
        const w = step.width || 2;
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, 0, size, w); ctx.fillRect(0, 0, w, size);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, size - w, size, w); ctx.fillRect(size - w, 0, w, size);
    },

    specks: (ctx, step, size) => {
        const count = step.count || 5;
        // Use a base seed from the step or size to keep it deterministic per tile type
        let seed = (step.x || 0) * 10 + (step.y || 0) * 20; 
        
        for (let i = 0; i < count; i++) {
            seed += 1;
            const s = (step.minSize || 0.05) * size + seededRandom(seed) * ((step.maxSize || 0.1) * size);
            const x = seededRandom(seed + 1) * size;
            const y = seededRandom(seed + 2) * size;
            
            if (step.shape === 'circle') { 
                ctx.beginPath(); 
                ctx.arc(x, y, s, 0, Math.PI*2); 
                ctx.fillStyle = step.color; 
                ctx.fill(); 
            } else { 
                ctx.fillStyle = step.color; 
                ctx.fillRect(x, y, s, s); 
            }
        }
    }
};

function drawLayers(ctx, size, layers) {
    if (!layers) return;
    layers.forEach(step => {
      if(!step) {
         console.log(step, layers);
         return;
      }
        if (Primitives[step.type]) {
            Primitives[step.type](ctx, step, size);
        } else if (step.type === 'outline') {
            ctx.strokeStyle = step.stroke;
            ctx.lineWidth = (step.width || 1);
            ctx.strokeRect(0, 0, size, size);
        }
    });
}

function getWorldTile(x, y, type, style, color, outline, regionId, forceSolid = false) {
    // 1. OPTIMIZATION: Reduce Coordinate Uniqueness
    const patternSize = 16;
    const cacheX = Math.abs(Math.floor(x)) % patternSize;
    const cacheY = Math.abs(Math.floor(y)) % patternSize;

    // 2. Generate Cache Key
    const key = `${style}_${type}_${color}_${outline}_${regionId}_${cacheX}_${cacheY}_${forceSolid}`;
    
    if (TextureCache[key]) return TextureCache[key];

    // 3. Setup Canvas
    const size = TILE_SIZE;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    // 4. Resolve Recipe
    let lookupType = type;
    if (type === 'tree') lookupType = 'base'; 
    else if (type === 'wall') lookupType = 'wall'; 
    else lookupType = 'floor'; 

    let layers = [];

    // Base Color Fill
    let baseColor = color;
    if (forceSolid && baseColor && baseColor.includes('rgba')) {
        baseColor = baseColor.replace(/,\s*[\d\.]+\s*\)/, ', 1.0)');
    }
    if (baseColor) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0,0,size,size);
    }

    // Get Definition from mapData
    if (typeof TextureStyles !== 'undefined' && TextureStyles[style]) {
        let def = TextureStyles[style][lookupType] || TextureStyles[style].layers || TextureStyles[style].base;
        
        if (def) {
            if (typeof def === 'function') {
                layers = def(baseColor, outline, cacheX, cacheY, regionId);
            } else {
                layers = def;
            }
        }
    }

    // 5. Draw
    drawLayers(ctx, size, layers);

    TextureCache[key] = c;
    return c;
}