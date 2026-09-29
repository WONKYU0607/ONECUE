// **검사 전용 — 서버를 띄우고, 신호(`SIGUSR2`)를 받을 때마다 시계를 하루씩 앞으로 보낸다.**
//
// 우편함은 **기간이 넘어갈 때만** 채워지고, 코인도 하루에 받을 수 있는 몫이 정해져 있다.
// 가짜 저장소는 메모리라 서버를 껐다 켜면 지워지므로, 날이 바뀌는 상황을 만들려면
// **한 프로세스 안에서** 시계가 넘어가야 한다.
//
// 넘기는 시점을 시간으로 정하면 개발 서버 부팅이 늦는 만큼 어긋난다 → 신호로 맞춘다.
//
// **`Date.now` 만 덮으면 부족하다** — `server/store.js` 의 티켓 날짜는 `new Date()` 로
// 오늘을 구한다. 그래서 인수 없는 `new Date()` 까지 같이 옮긴다
// (인수가 있는 `new Date(ms)` 는 그대로 둔다 — 기간 열쇠 계산이 그걸 쓴다).
const add = +process.env.JUMP_MS || 0;
if (add > 0){
  const Real = Date;
  let n = 0;
  const now = () => Real.now() + n * add;
  class Shifted extends Real {
    constructor(...a){ if (a.length === 0) super(now()); else super(...a); }
    static now(){ return now(); }
  }
  globalThis.Date = Shifted;
  process.on('SIGUSR2', () => { n++; });
}
await import('../server/index.js');
