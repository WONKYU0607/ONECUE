# DUEL

1대1 온라인 총격 대결 게임. Vite + React 기반이며, 게임 자체는 캔버스 위에서 돈다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173 (같은 와이파이의 폰에서도 접속 가능)
npm test         # 브라우저 없이 시뮬·넷코드 검증
npm run build    # dist/ 생성
```

## 구조

```
src/
  main.jsx          React 진입점
  App.jsx           화면 전환 (login / match / game) — 지금은 game만
  ui/
    GameCanvas.jsx  캔버스 마운트 + 게임 붙였다 떼기
    TunePanel.jsx   디버그용 실시간 튜닝 패널
  game/
    config.js       상수, 튜닝 테이블, 격자·벽 좌표표, 팀 컬러
    sim.js          순수 결정론 시뮬레이션 (DOM 없음, 고정소수점 정수 연산만)
    net.js          Transport(Loopback) / Server(권위) / Client(예측)
    layout.js       화면 비율에 따른 레이아웃·스틱 기하 (순수 함수)
    render.js       캔버스 그리기
    input.js        포인터·키보드
    game.js         createGame(canvas) — 전부 묶어서 rAF 루프를 돌림
public/assets/      아레나 배경, 캐릭터 시트, 아이템 시트
test/               노드에서 도는 테스트
```

### React를 쓸 때 지켜야 할 두 가지

**1. 게임 상태를 React state에 올리지 않는다.**
시뮬은 60Hz로 상태가 바뀐다. 그걸 `useState`에 넣으면 매 프레임 리렌더가 돌아 프레임이 죽는다.
`createGame()`이 만든 객체는 `useRef`에만 두고, React는 `<canvas>` 하나와
드물게 바뀌는 값(페이즈)만 그린다. 페이즈도 매 프레임이 아니라 **바뀔 때만** `onPhase`로 올린다.

**2. StrictMode는 개발 중 effect를 두 번 실행한다.**
정리를 안 하면 `Server`와 rAF 루프가 두 개 생겨 총알이 두 배로 나오고 데싱크가 난다.
`GameCanvas`의 cleanup에서 `game.stop()`이 루프 취소 + 리스너 해제를 전부 한다.
`test/lifecycle.test.js`가 마운트 → 정리 → 재마운트 후 리스너 수가 늘지 않는지 검사한다.

## 테스트

| 파일 | 검증 내용 |
|---|---|
| `sim.test.js` | 페이즈 전이, 시작 전 이동 금지, 자동 발사 간격, 양쪽 대칭성, 벽·진영 경계, 대각선 속도, 결정론 |
| `net.test.js` | 편도 0~300ms에서 예측 오차·데싱크·입력 유실, 페이즈 전파, 튜닝값 동기화 |
| `layout.test.js` | 기기별 레이아웃·여백, 스틱 8방향·데드존 |
| `lifecycle.test.js` | 마운트/언마운트 정리 (StrictMode 이중 실행 대비) |

`net.test.js`는 `setClock()`으로 가상 시계를 주입해 실제 시간 없이 결정론적으로 돈다.

## 넷코드

서버 권위 + 클라 예측. `game/net.js`의 `Loopback`이 통신 경계이며,
온라인 전환 시 **이 클래스만** WebSocket 구현으로 교체한다. 시뮬·서버 코드는 그대로 둔다.

- 서버가 60Hz 고정 스텝으로 권위 상태를 굴리고 확정 프레임을 브로드캐스트
- 클라는 확정 상태에 아직 확정 안 된 자기 입력을 재적용해 화면을 그림 → 내 조작 지연 0
- 상대는 `2 × 편도지연`만큼 과거로 보임 (구조상 불가피)

## 디버그 플래그 (`src/game/config.js`)

| 상수 | 현재 | 설명 |
|---|---|---|
| `DEBUG_INF_HP` | `true` | 체력 무한. **출시 전 false** |
| `SHOW_HUD` | `false` | SV/CL/LAT 수치 표시 |
| `DEBUG_LOCAL_BOTH` | `false` | true면 두 캐릭터 다 조작 |
| `VIEW.grid` | `true` | 바닥 격자 표시 |
| `NET.oneway` | `60` | 가상 편도 지연(ms). `[` `]` 키로 조절 |

## 배포

- **웹**: GitHub에 push → Vercel이 `npm run build` 후 `dist/` 배포
- **앱**: Capacitor. `base: './'`로 잡아둬서 `file://`에서도 자산 경로가 맞는다

```bash
npm run build
npx cap sync android
npx cap open android      # Android Studio
```

## 남은 작업

- 로그인 / 매칭 화면 (`App.jsx`의 screen 분기)
- 아이템 배치 단계 (1~3칸 벽·바리케이트·드럼통, 스프라이트는 `public/assets/items.webp`)
- 아이템 충돌·파괴 처리
- WebSocket 서버
- 2대2 확장 (캐릭터 컬러 4종 준비됨)
