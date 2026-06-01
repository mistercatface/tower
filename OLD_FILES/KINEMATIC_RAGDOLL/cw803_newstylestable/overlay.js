function createOverlay() {
   const uiOverlay = document.createElement('div');
   uiOverlay.style.position = 'absolute';
   uiOverlay.style.top = '10px';
   uiOverlay.style.right = '10px';
   uiOverlay.style.zIndex = '10';
   uiOverlay.style.color = 'black';
   uiOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
   uiOverlay.style.padding = '8px';
   uiOverlay.style.borderRadius = '5px';
   uiOverlay.style.fontFamily = 'sans-serif';
   uiOverlay.style.userSelect = 'none';
   uiOverlay.style.display = 'flex';
   uiOverlay.style.flexDirection = 'column';
   uiOverlay.style.gap = '6px';
   uiOverlay.style.minWidth = '120px'; // Ensure slider has space

   // 1. Pathfinding Checkbox
   const regionLabel = document.createElement('label');
   regionLabel.style.cursor = 'pointer';
   regionLabel.style.fontSize = '12px';
   const regionCheckbox = document.createElement('input');
   regionCheckbox.type = 'checkbox';
   regionCheckbox.checked = (typeof REGION_DEBUG_ON !== 'undefined' ? REGION_DEBUG_ON : false);
   regionCheckbox.style.marginRight = '4px';
   regionCheckbox.addEventListener('change', () => { 
       if(typeof REGION_DEBUG_ON !== 'undefined') REGION_DEBUG_ON = regionCheckbox.checked; 
   });
   regionLabel.appendChild(regionCheckbox);
   regionLabel.appendChild(document.createTextNode('PATHFINDING'));
   uiOverlay.appendChild(regionLabel);

   // 2. Brightness Slider (NEW)
   const lightContainer = document.createElement('div');
   lightContainer.style.display = 'flex';
   lightContainer.style.flexDirection = 'column';
   lightContainer.style.marginTop = '4px';
   lightContainer.style.borderTop = '1px solid #ccc';
   lightContainer.style.paddingTop = '4px';

   const lightLabel = document.createElement('div');
   lightLabel.innerText = 'LIGHT LEVEL';
   lightLabel.style.fontSize = '10px';
   lightLabel.style.fontWeight = 'bold';
   lightLabel.style.marginBottom = '2px';
   lightLabel.style.textAlign = 'center';

   const lightSlider = document.createElement('input');
   lightSlider.type = 'range';
   lightSlider.min = '0.0';
   lightSlider.max = '1.0';
   lightSlider.step = '0.01';
   lightSlider.value = '1.0'; // Default start
   lightSlider.style.width = '100%';
   lightSlider.style.cursor = 'pointer';

   // Hook into the LightingRenderer
   lightSlider.addEventListener('input', (e) => {
       const val = parseFloat(e.target.value);
       if (typeof LightingRenderer !== 'undefined') {
           LightingRenderer.setBrightness(val);
       }
   });

   lightContainer.appendChild(lightLabel);
   lightContainer.appendChild(lightSlider);
   uiOverlay.appendChild(lightContainer);

   document.body.appendChild(uiOverlay);
}