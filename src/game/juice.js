// 화면 흔들림·총구 섬광·파편처럼 '보기에만' 영향을 주는 연출.
// 시뮬 상태에 넣지 않는다 — 규칙에 영향이 없고, 서버와 주고받을 필요도 없다.
// (양쪽 화면이 조금 달라도 게임 진행은 똑같다)

export function createJuice(){
  let shakeAmp = 0, shakeT = 0;
  const sparks = [];      // { x, y, vx, vy, life, max, color }
  const muzzles = [];     // { x, y, life, max, up }

  return {
    shake(amp){ shakeAmp = Math.max(shakeAmp, amp); shakeT = 1; },

    spark(x, y, color, n = 6, spread = 40){
      for (let i = 0; i < n; i++){
        const a = Math.random() * Math.PI * 2;
        const sp = 20 + Math.random() * spread;
        sparks.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0, max: 0.18 + Math.random() * 0.2, color
        });
      }
    },

    muzzle(x, y, up){ muzzles.push({ x, y, up, life: 0, max: 0.07 }); },

    update(dt){
      if (shakeT > 0){
        shakeT -= dt * 6;                 // 0.17초쯤에 잦아든다
        if (shakeT <= 0){ shakeT = 0; shakeAmp = 0; }
      }
      for (let i = sparks.length - 1; i >= 0; i--){
        const s = sparks[i];
        s.life += dt;
        if (s.life >= s.max){ sparks.splice(i, 1); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.vy += 90 * dt;                  // 살짝 가라앉는다
      }
      for (let i = muzzles.length - 1; i >= 0; i--){
        muzzles[i].life += dt;
        if (muzzles[i].life >= muzzles[i].max) muzzles.splice(i, 1);
      }
    },

    // 흔들림 오프셋 (월드 단위)
    offset(){
      if (shakeT <= 0) return { x: 0, y: 0 };
      const k = shakeAmp * shakeT;
      return { x: (Math.random() * 2 - 1) * k, y: (Math.random() * 2 - 1) * k };
    },

    sparks, muzzles
  };
}
