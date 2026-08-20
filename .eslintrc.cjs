module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react'],
  settings: { react: { version: 'detect' } },
  // **JSX 안에서 쓰는 것도 '사용'으로 세야 한다.** 안 그러면 화면 파일의 모든 컴포넌트가
  // "안 쓴다"로 잡혀 경고 251개가 되고, 그 속에 진짜 죽은 코드가 묻힌다
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': 'warn',
    'no-empty': 'warn',
    'no-undef': 'error',
    // **JSX 안에서 쓰는 것도 '사용'으로 센다.** 안 켜면 화면 파일의 컴포넌트가 전부
    // "안 쓴다"로 잡혀 경고에 묻힌다
    'react/jsx-uses-vars': 'error',
    'react/jsx-uses-react': 'error',
  },
};
