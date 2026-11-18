// index.html에서 <script id="tally-core"> 블록만 꺼내 DOM 없이 실행한다.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML_PATH = path.join(__dirname, "..", "index.html");

function loadCore() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script id="tally-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html에 <script id="tally-core">가 없습니다');
  const context = vm.createContext({}); // window·document 없음: 로직이 화면에 기대면 여기서 실패한다
  vm.runInContext(m[1] + "\nthis.SurveyTally = SurveyTally;", context);
  return context.SurveyTally;
}

module.exports = { loadCore, HTML_PATH };
