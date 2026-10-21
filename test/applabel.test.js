// [stated] **"폰 바탕화면에 당연히 영어폰은 건 소드 아레나가 나와야지"** (2026-10-21).
// 바탕화면 이름은 AndroidManifest 의 label 이 정한다 — 앱(application)과 화면(activity) 둘 다.
// 폰 언어가 한국어면 values-ko, 그 밖의 언어는 values(기본) 를 쓴다.
//
// 이 작업 공간에는 안드로이드 빌드 도구가 없어 빌드로는 못 본다. 빌드가 깨지는 흔한 경우를 여기서 막는다:
//   · 기본(values) 에 없는 이름을 가리킴 → 빌드 실패
//   · XML 이 깨짐 (주석 안의 `--` 등)
//   · 문자열 안의 따옴표(') 를 안 막음 → aapt 오류
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const MAN = 'android/app/src/main/AndroidManifest.xml';
// `android/` 는 깃에 안 올린다(.gitignore) — 그 폴더가 없는 곳(깃허브에서 받은 것만 있는 곳)에서는 건너뛴다.
// **폴더가 있는데 이름 파일이 없으면 실패다** — 바탕화면 이름 묶음을 안 덮은 것이다
if (!fs.existsSync('android')){ console.log('applabel.test.js 건너뜀 — android 폴더 없음'); process.exit(0); }
const DEF = 'android/app/src/main/res/values/app_label.xml';
const KO = 'android/app/src/main/res/values-ko/app_label.xml';

let parse = null;
try {
  const { DOMParser } = createRequire(import.meta.url)('@xmldom/xmldom');
  parse = src => {
    const errs = [];
    const doc = new DOMParser({ onError: (lvl, msg) => { if (lvl !== 'warning') errs.push(msg); } })
      .parseFromString(src, 'text/xml');
    return { doc, errs };
  };
} catch { /* 없으면 글자로만 본다 */ }

const strOf = (src, name) => {
  const m = src.match(new RegExp(`<string name="${name}">([^<]*)</string>`));
  return m ? m[1] : null;
};

console.log('바탕화면 이름이 폰 언어를 따른다');
{
  const man = fs.readFileSync(MAN, 'utf8');
  const labels = [...man.matchAll(/android:label="([^"]+)"/g)].map(m => m[1]);
  assert(labels.length === 2 && labels.every(l => l === '@string/app_label'),
    `  앱·화면 이름 둘 다 app_label 을 쓴다 (${labels.join(', ')})`);
  const def = fs.readFileSync(DEF, 'utf8'), ko = fs.readFileSync(KO, 'utf8');
  assert(strOf(def, 'app_label') === 'Gun Sword Arena', `  기본(영어 등): ${strOf(def, 'app_label')}`);
  assert(strOf(ko, 'app_label') === '총칼대전', `  한국어: ${strOf(ko, 'app_label')}`);
  // strings.xml(사용자 기기에만 있음)의 app_name 과 겹치지 않게 다른 이름을 쓴다
  assert(!/name="app_name"/.test(def + ko), '  app_name 을 다시 정의하지 않는다 (겹치면 빌드 실패)');
}

console.log('XML 이 깨지지 않았다');
for (const f of [MAN, DEF, KO]){
  const src = fs.readFileSync(f, 'utf8');
  for (const c of src.matchAll(/<!--([\s\S]*?)-->/g))
    assert(!c[1].includes('--'), `  ${f}: 주석 안에 -- 가 없다`);
  for (const s of src.matchAll(/<string[^>]*>([^<]*)<\/string>/g))
    assert(!/(^|[^\\])'/.test(s[1]), `  ${f}: 문자열의 ' 를 막았다 (${s[1]})`);
  if (parse){
    const { doc, errs } = parse(src);
    assert(errs.length === 0 && doc.documentElement, `  ${f}: 읽힌다 ${errs.join(' ')}`);
  }
}

console.log('applabel.test.js 통과');
