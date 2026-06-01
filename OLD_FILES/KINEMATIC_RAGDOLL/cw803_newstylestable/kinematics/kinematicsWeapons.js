const WEAPON_VISUALS = {
   PISTOL: {
      extendArms: 'left',
      extensionValue: -1.5,
      pose: 'PISTOL',
      draw: (ctx, leftHand, rightHand, scale, aimAngle, S, COLORS) => {
         const handX = leftHand.x;
         const handY = leftHand.y;

         ctx.save();
         ctx.translate(handX, handY);
         ctx.rotate(aimAngle);
         ctx.scale(scale, scale);

         if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
         ctx.translate(S(0.01), -S(0.03));

         const barrelLen = S(0.2);
         const barrelHeight = S(0.04);
         const gripHeight = S(0.08);

         const gGun = ctx.createLinearGradient(0, -S(0.04), 0, 0);
         gGun.addColorStop(0, COLORS.GUN[2]);
         gGun.addColorStop(0.5, COLORS.GUN[1]);
         gGun.addColorStop(1, COLORS.GUN[0]);

         ctx.fillStyle = gGun;
         if (gripHeight > S(0.01)) ctx.fillRect(-S(0.02), 0, S(0.045), gripHeight);
         ctx.fillRect(0, -S(0.02), barrelLen, barrelHeight);

         ctx.fillStyle = '#666';
         ctx.fillRect(0, -S(0.02), barrelLen, S(0.01));

         if (Math.sin(aimAngle) > 0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(barrelLen - S(0.005), -S(0.02), S(0.015), barrelHeight);
         } else {
            ctx.fillStyle = '#222';
            ctx.fillRect(0, -S(0.025), S(0.01), S(0.01));
         }

         ctx.restore();
      },
      getMuzzleOffset: (handScreen, aimAngle, size) => {
         return calculateMuzzleOffset(handScreen, aimAngle, size, 0.20, 0.01, -0.03);
      }
   },
   SHOTGUN: {
      pose: 'SHOTGUN',
      extendArms: 'both',
      extensionValue: -1.5,
      draw: (ctx, leftHand, rightHand, scale, aimAngle, S, COLORS) => {
         const handX = leftHand.x;
         const handY = leftHand.y;
         ctx.save();
         ctx.translate(handX, handY);
         ctx.rotate(aimAngle);
         ctx.scale(scale, scale);

         if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
         ctx.translate(S(0.01), -S(0.03));

         const barrelLen = S(0.32);
         const barrelHeight = S(0.045);
         const stockLen = S(0.10);

         // Stock behind hand
         ctx.fillStyle = '#5c3a21';
         ctx.beginPath();
         ctx.moveTo(-stockLen, -S(0.01));
         ctx.lineTo(0, -S(0.02));
         ctx.lineTo(0, S(0.025));
         ctx.lineTo(-stockLen, S(0.04));
         ctx.closePath();
         ctx.fill();

         // Receiver
         ctx.fillStyle = '#1a1a1a';
         ctx.fillRect(-S(0.02), -S(0.025), S(0.05), S(0.05));

         // Barrel
         const gBarrel = ctx.createLinearGradient(0, -barrelHeight, 0, barrelHeight);
         gBarrel.addColorStop(0, '#666');
         gBarrel.addColorStop(0.5, '#444');
         gBarrel.addColorStop(1, '#222');
         ctx.fillStyle = gBarrel;
         ctx.fillRect(0, -barrelHeight / 2, barrelLen, barrelHeight);

         // Barrel highlight
         ctx.fillStyle = '#888';
         ctx.fillRect(0, -barrelHeight / 2, barrelLen, S(0.01));

         // Pump
         ctx.fillStyle = '#4a3828';
         ctx.fillRect(S(0.08), -S(0.025), S(0.08), S(0.05));

         // Muzzle
         ctx.fillStyle = '#000';
         ctx.fillRect(barrelLen - S(0.005), -barrelHeight / 2, S(0.015), barrelHeight);

         ctx.restore();
      },
      getMuzzleOffset: (handScreen, aimAngle, size) => {
         // Shotgun is longer (0.32)
         return calculateMuzzleOffset(handScreen, aimAngle, size, 0.32, 0.01, -0.03);
      }
   },

   ASSAULT_RIFLE: {
      pose: 'SHOTGUN',
      extendArms: 'both',
      extensionValue: -1.5,
      draw: (ctx, leftHand, rightHand, scale, aimAngle, S, COLORS) => {
         const handX = leftHand.x;
         const handY = leftHand.y;

         ctx.save();
         ctx.translate(handX, handY);
         ctx.rotate(aimAngle);
         ctx.scale(scale, scale);

         if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
         ctx.translate(S(0.01), -S(0.03));

         const barrelLen = S(0.28);
         const barrelHeight = S(0.035);
         const stockLen = S(0.10);

         // Stock
         ctx.fillStyle = '#222';
         ctx.fillRect(-stockLen, -S(0.012), stockLen, S(0.024));

         // Buffer tube
         ctx.fillStyle = '#333';
         ctx.fillRect(-stockLen, -S(0.01), stockLen * 0.6, S(0.02));

         // Receiver
         ctx.fillStyle = '#2a2a2a';
         ctx.fillRect(-S(0.02), -S(0.02), S(0.06), S(0.04));

         // Barrel
         const gBarrel = ctx.createLinearGradient(0, -barrelHeight, 0, barrelHeight);
         gBarrel.addColorStop(0, '#444');
         gBarrel.addColorStop(0.5, '#222');
         gBarrel.addColorStop(1, '#111');
         ctx.fillStyle = gBarrel;
         ctx.fillRect(0, -barrelHeight / 2, barrelLen, barrelHeight);

         // Handguard
         ctx.fillStyle = '#333';
         ctx.fillRect(S(0.02), -S(0.015), S(0.10), S(0.03));

         // Magazine
         ctx.fillStyle = '#1a1a1a';
         ctx.fillRect(S(0.01), S(0.01), S(0.02), S(0.04));

         // Muzzle
         ctx.fillStyle = '#000';
         ctx.fillRect(barrelLen - S(0.005), -barrelHeight / 2, S(0.01), barrelHeight);

         ctx.restore();
      },
      getMuzzleOffset: (handScreen, aimAngle, size) => {
         // Rifle is medium length (0.28)
         return calculateMuzzleOffset(handScreen, aimAngle, size, 0.28, 0.01, -0.03);
      }
   },

   SNIPER: {
      pose: 'SHOTGUN',
      extendArms: 'both',
      extensionValue: -1.5,
      draw: (ctx, leftHand, rightHand, scale, aimAngle, S, COLORS) => {
         const handX = leftHand.x;
         const handY = leftHand.y;

         ctx.save();
         ctx.translate(handX, handY);
         ctx.rotate(aimAngle);
         ctx.scale(scale, scale);

         if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
         ctx.translate(S(0.01), -S(0.03));

         const barrelLen = S(0.38);
         const barrelHeight = S(0.03);
         const stockLen = S(0.12);

         // Stock (wood)
         const gStock = ctx.createLinearGradient(0, -S(0.02), 0, S(0.02));
         gStock.addColorStop(0, '#4a3728');
         gStock.addColorStop(0.5, '#3d2d1f');
         gStock.addColorStop(1, '#2a1f16');
         ctx.fillStyle = gStock;
         ctx.beginPath();
         ctx.moveTo(-stockLen, -S(0.01));
         ctx.lineTo(0, -S(0.015));
         ctx.lineTo(0, S(0.02));
         ctx.lineTo(-stockLen, S(0.025));
         ctx.closePath();
         ctx.fill();

         // Receiver
         ctx.fillStyle = '#1a1a1a';
         ctx.fillRect(-S(0.01), -S(0.018), S(0.05), S(0.036));

         // Barrel
         ctx.fillStyle = '#333';
         ctx.fillRect(0, -barrelHeight / 2, barrelLen, barrelHeight);

         // Scope
         ctx.fillStyle = '#111';
         ctx.fillRect(S(0.02), -S(0.04), S(0.12), S(0.018));

         // Scope lenses
         ctx.fillStyle = '#226';
         ctx.beginPath();
         ctx.arc(S(0.02), -S(0.031), S(0.006), 0, Math.PI * 2);
         ctx.fill();
         ctx.beginPath();
         ctx.arc(S(0.02) + S(0.12), -S(0.031), S(0.008), 0, Math.PI * 2);
         ctx.fill();

         // Bipod (folded)
         ctx.strokeStyle = '#444';
         ctx.lineWidth = S(0.004);
         ctx.beginPath();
         ctx.moveTo(S(0.10), S(0.01));
         ctx.lineTo(S(0.12), S(0.03));
         ctx.stroke();

         // Muzzle
         ctx.fillStyle = '#000';
         ctx.fillRect(barrelLen - S(0.005), -barrelHeight / 2, S(0.01), barrelHeight);

         ctx.restore();
      },
      getMuzzleOffset: (handScreen, aimAngle, size) => {
         return calculateMuzzleOffset(handScreen, aimAngle, size, 0.38, 0.01, -0.03);
      }
   }

};
const getWeaponVisual = (weaponName) => WEAPON_VISUALS[weaponName] || null;
const getWeaponPose = (entity) => {
   const visual = getWeaponVisual(entity?.equippedWeapon);
   return visual ? POSES[visual.pose] : null;
};

const calculateMuzzleOffset = (handScreen, aimAngle, size, length, offsetX = 0.01, offsetY = -0.03) => {
   // handScreen.x and handScreen.y are ALREADY in screen space
   // We just need to calculate the local offset and rotate it
   
   // Local offset in "size" units (normalized to tile size)
   const localX = (offsetX + length) * size;
   const localY = offsetY * size;
   
   // Handle flip (facing left vs right)
   const isFlipped = Math.cos(aimAngle) < 0;
   const flippedY = isFlipped ? -localY : localY;
   
   // Rotate into screen space
   const c = Math.cos(aimAngle);
   const s = Math.sin(aimAngle);
   
   return {
      x: localX * c - flippedY * s,
      y: localX * s + flippedY * c
   };
};

// ======== PUBLIC API ========
function getEntityMuzzlePosition(entity) {
   const state = ENTITY_STATES[entity.id];
   return getMuzzleWorldPosition(entity, state);
}

function getMuzzleWorldPosition(entity, state) {
   if (state?.muzzleWorld) {
      return state.muzzleWorld;
   }
   return { x: entity.x + 0.5, y: entity.y + 0.5 };
}

function getWeaponLength(weaponName) {
   if(weaponName === 'PISTOL') return 0.20;
   if(weaponName === 'SHOTGUN') return 0.32;
   if(weaponName === 'ASSAULT_RIFLE') return 0.28;
   if(weaponName === 'SNIPER') return 0.38;
   return 0.20;
}