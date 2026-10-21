import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// [stated] 홈 아래 **배포 확인 표시**. 예전엔 `v0.2.6` 을 손으로 적어 두고 고칠 때마다 올려야 했는데
// 안 올리면 옛 빌드인지 가려낼 수 없었다 (2026-10-21 점검) → **빌드할 때 시각을 자동으로 찍는다** (한국 시간 월일-시분)
const BUILD_STAMP = (() => {
  const d = new Date(Date.now() + 9 * 3600e3);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
})();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_STAMP__: JSON.stringify(BUILD_STAMP) },
  base: './',            // Capacitor(file://)에서도 자산 경로가 맞도록 상대 경로
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { host: true } // 같은 와이파이의 폰에서 바로 접속해 테스트
});
