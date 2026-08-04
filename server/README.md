# 듀얼 서버

실시간 대전용 WebSocket 서버. 클라이언트와 **같은 시뮬레이션 코드**를 import한다
(`../src/game/sim.js`, `config.js`). 규칙이 갈라지면 즉시 데싱크가 나므로 절대 복사해두지 말 것.

## 로컬 실행

```bash
cd server
npm install
npm start           # ws://localhost:8080
```

클라이언트는 기본으로 `ws://localhost:8080`에 붙는다. 바꾸려면 프로젝트 루트에 `.env`:

```
VITE_SERVER_URL=wss://내서버.onrender.com
```

## Render 배포

1. Render에서 **New → Web Service**, 저장소 연결
2. **Root Directory**: `server`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. 인스턴스 타입 Free

Render가 `PORT` 환경변수를 주므로 서버가 그 포트로 뜬다. 주소는 `https://...onrender.com`이고,
클라이언트에서는 `wss://...onrender.com`로 접속한다 (http→ws가 아니라 **https→wss**).

무료 플랜은 15분간 접속이 없으면 잠들고 깨는 데 1분쯤 걸린다.

## 구조

- 접속하면 빈 자리가 있는 방에 넣고, 없으면 새 방을 만든다
- 방에 들어오면 `hello`(슬롯 번호) + 현재 상태 스냅샷을 보낸다.
  **방은 이미 돌고 있으므로 스냅샷 없이는 클라가 시작점을 못 잡는다**
- 두 자리가 차면 `go`를 브로드캐스트
- 들어오는 메시지의 `pid`는 **소켓의 슬롯으로 덮어쓴다**. 클라가 보낸 pid를 믿으면
  남의 캐릭터를 조작할 수 있다
- 모든 방을 타이머 하나로 굴린다. 방마다 `setInterval`을 두면 방이 늘수록 틱이 흔들린다
- 15초마다 ping/pong으로 죽은 소켓을 정리한다 (모바일은 연결이 조용히 끊기는 경우가 많다)

## 테스트

프로젝트 루트에서:

```bash
npm test            # online.test.js가 이 서버를 실제로 띄워서 검증
```
