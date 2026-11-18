"use strict";
// 약속 지킴 시험: 외부 자원·분석 도구·전송·저장을 쓰지 않는지 index.html을 직접 살핀다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { HTML_PATH } = require("./load-core");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(HTML_PATH, "utf8");

test("외부 주소를 불러오지 않는다 (라이브러리·글꼴·분석 도구 없음)", () => {
  assert.doesNotMatch(html, /https?:\/\//i, "http(s) 주소가 있음");
  assert.doesNotMatch(html, /(^|[^:])\/\/[a-z0-9-]+\.[a-z]/i, "프로토콜 생략 주소(//host)가 있음");
  assert.doesNotMatch(html, /<script[^>]*\bsrc\s*=/i, "외부 스크립트가 있음");
  assert.doesNotMatch(html, /<link\b/i, "link 태그가 있음");
  assert.doesNotMatch(html, /@import|@font-face|url\s*\(/i, "CSS 외부 자원이 있음");
  assert.doesNotMatch(html, /<(img|iframe|object|embed|video|audio|source)\b/i, "외부 자원 태그가 있음");
});

test("데이터를 보내거나 저장하는 API를 쓰지 않는다", () => {
  const banned = [
    "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "RTCPeerConnection",
    "localStorage", "sessionStorage", "indexedDB", "document.cookie", "caches.", "serviceWorker",
    "postMessage", "window.open", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(",
    "gtag", "analytics", "<form"
  ];
  for (const word of banned) assert.ok(!html.includes(word), `${word} 사용`);
});

test("CSP로 바깥 요청을 막는다", () => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(m, "CSP 메타 태그 없음");
  const csp = m[1];
  for (const d of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "img-src 'none'", "font-src 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(d), `CSP에 ${d} 없음`);
  }
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<script"), "CSP가 스크립트보다 뒤에 있음");
});

test("입력칸은 맞춤법 검사·자동완성을 끈다", () => {
  const m = html.match(/<textarea[^>]*>/);
  assert.ok(m);
  assert.match(m[0], /spellcheck="false"/);
  assert.match(m[0], /autocomplete="off"/);
});

test("계산 로직 블록은 화면을 건드리지 않는다", () => {
  const core = html.match(/<script id="tally-core">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(core, /\b(document|window|navigator)\b/);
});

test("저장소 맨 위에 빈 .nojekyll 파일이 있다", () => {
  const p = path.join(ROOT, ".nojekyll");
  assert.ok(fs.existsSync(p), ".nojekyll 없음");
  assert.equal(fs.statSync(p).size, 0, ".nojekyll이 비어 있지 않음");
});
