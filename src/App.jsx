import { useState } from 'react';
import GameCanvas from './ui/GameCanvas.jsx';

// 화면 전환 자리. 로그인·매칭이 붙으면 여기서 갈라진다
export default function App(){
  const [screen] = useState('game');   // 'login' | 'match' | 'game'

  if (screen === 'game') return <GameCanvas />;
  return null;
}
