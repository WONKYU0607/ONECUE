import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',            // Capacitor(file://)에서도 자산 경로가 맞도록 상대 경로
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { host: true } // 같은 와이파이의 폰에서 바로 접속해 테스트
});
