"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCore } = require("./load-core");

const { parseTSV, classifyCell, formatAverage, tally } = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm 컨텍스트 객체를 비교 가능한 값으로

function row(result, name) {
  const q = result.questions.find((x) => x.name === name);
  assert.ok(q, `문항 ${name} 없음`);
  return { valid: q.valid, average: q.average, blank: q.blank, excluded: q.excluded };
}

test("칸 판정: 1~5는 유효(앞뒤 공백 제거)", () => {
  for (const v of ["1", "2", "3", "4", "5", " 3", "4 ", "\t5\t", " 2　"]) {
    assert.equal(classifyCell(v).kind, "valid", JSON.stringify(v));
  }
  assert.equal(classifyCell(" 4 ").score, 4);
});

test("칸 판정: 비었거나 공백만 있으면 빈 응답", () => {
  for (const v of ["", " ", "   ", "　", undefined]) {
    assert.equal(classifyCell(v).kind, "blank", JSON.stringify(v));
  }
});

test("칸 판정: 그 밖의 값은 제외", () => {
  for (const v of ["0", "6", "10", "3.0", "03", "+3", "-1", "３", "a", "3점", "1 2", "1,2"]) {
    assert.equal(classifyCell(v).kind, "excluded", JSON.stringify(v));
  }
});

test("평균: 소수 셋째 자리에서 반올림해 둘째 자리까지", () => {
  assert.equal(formatAverage(0, 0), "-");
  assert.equal(formatAverage(9, 3), "3.00");
  assert.equal(formatAverage(10, 3), "3.33"); // 3.333…
  assert.equal(formatAverage(11, 3), "3.67"); // 3.666…
  assert.equal(formatAverage(469, 200), "2.35"); // 2.345 → 2.35 (부동소수점이면 2.34가 되기 쉬움)
  assert.equal(formatAverage(201, 200), "1.01"); // 1.005 → 1.01
  assert.equal(formatAverage(5, 1), "5.00");
  assert.equal(formatAverage(7, 2), "3.50");
  assert.equal(formatAverage(2009, 2000), "1.00"); // 1.0045 → 1.00
});

test("엑셀 붙여넣기: 첫 열은 집계하지 않고 문항별 결과를 낸다", () => {
  const text =
    "응답번호\t만족도\t추천\r\n" +
    "1\t5\t4\r\n" +
    "2\t4\t \r\n" +
    "3\t3\t6\r\n" +
    "4\t\tx\r\n";
  const r = tally(text);
  assert.equal(r.error, null);
  assert.equal(r.respondents, 4);
  assert.deepEqual(plain(r.questions.map((q) => q.name)), ["만족도", "추천"]);
  assert.deepEqual(row(r, "만족도"), { valid: 3, average: "4.00", blank: 1, excluded: 0 });
  assert.deepEqual(row(r, "추천"), { valid: 1, average: "4.00", blank: 1, excluded: 2 });
});

test("응답번호 열 값이 1~5여도 집계되지 않는다", () => {
  const r = tally("번호\tQ1\n1\t2\n2\t2\n");
  assert.equal(r.questions.length, 1);
  assert.deepEqual(row(r, "Q1"), { valid: 2, average: "2.00", blank: 0, excluded: 0 });
});

test("유효 응답이 0이면 평균은 -", () => {
  const r = tally("번호\tQ1\tQ2\n1\t\tabc\n2\t \t7\n");
  assert.deepEqual(row(r, "Q1"), { valid: 0, average: "-", blank: 2, excluded: 0 });
  assert.deepEqual(row(r, "Q2"), { valid: 0, average: "-", blank: 0, excluded: 2 });
});

test("칸 수가 모자란 줄은 모자란 칸을 빈 응답으로 센다", () => {
  const r = tally("번호\tQ1\tQ2\tQ3\n1\t5\n2\n3\t1\t2\t3\n");
  assert.deepEqual(row(r, "Q1"), { valid: 2, average: "3.00", blank: 1, excluded: 0 });
  assert.deepEqual(row(r, "Q2"), { valid: 1, average: "2.00", blank: 2, excluded: 0 });
  assert.deepEqual(row(r, "Q3"), { valid: 1, average: "3.00", blank: 2, excluded: 0 });
});

test("머리글보다 많은 칸은 무시한다", () => {
  const r = tally("번호\tQ1\n1\t3\t5\t5\n");
  assert.equal(r.questions.length, 1);
  assert.deepEqual(row(r, "Q1"), { valid: 1, average: "3.00", blank: 0, excluded: 0 });
});

test("끝 줄바꿈·완전히 빈 줄은 응답으로 치지 않는다", () => {
  const r = tally("\n번호\tQ1\r\n1\t4\r\n\r\n2\t2\r\n\r\n");
  assert.equal(r.respondents, 2);
  assert.deepEqual(row(r, "Q1"), { valid: 2, average: "3.00", blank: 0, excluded: 0 });
});

test("탭만 있는 줄은 전부 빈 응답인 응답자다", () => {
  const r = tally("번호\tQ1\tQ2\n\t\t\n");
  assert.equal(r.respondents, 1);
  assert.deepEqual(row(r, "Q1"), { valid: 0, average: "-", blank: 1, excluded: 0 });
});

test("줄바꿈 \\n, \\r\\n, \\r 모두 처리한다", () => {
  for (const nl of ["\n", "\r\n", "\r"]) {
    const r = tally(["번호\tQ1", "1\t1", "2\t2"].join(nl));
    assert.deepEqual(row(r, "Q1"), { valid: 2, average: "1.50", blank: 0, excluded: 0 }, JSON.stringify(nl));
  }
});

test("엑셀 따옴표 칸: 칸 안 줄바꿈·탭·따옴표", () => {
  assert.deepEqual(plain(parseTSV('a\t"b\nc"\td\n')), [["a", "b\nc", "d"]]);
  assert.deepEqual(plain(parseTSV('"x\ty"\t"say ""hi"""')), [["x\ty", 'say "hi"']]);
  const r = tally('번호\t"서비스\n만족도"\t"추천 ""의향"""\n1\t5\t3\n');
  assert.deepEqual(plain(r.questions.map((q) => q.name)), ["서비스\n만족도", '추천 "의향"']);
  assert.deepEqual(row(r, "서비스\n만족도"), { valid: 1, average: "5.00", blank: 0, excluded: 0 });
});

test("닫히지 않은 따옴표는 보통 글자로 읽는다", () => {
  assert.deepEqual(plain(parseTSV('1\t"3\t4')), [["1", '"3', "4"]]);
  const r = tally('번호\tQ1\tQ2\n1\t"3\t4\n');
  assert.deepEqual(row(r, "Q1"), { valid: 0, average: "-", blank: 0, excluded: 1 });
  assert.deepEqual(row(r, "Q2"), { valid: 1, average: "4.00", blank: 0, excluded: 0 });
});

test("이름 없는 문항은 열 번호로 표시한다", () => {
  const r = tally("번호\t\tQ3\n1\t2\t3\n");
  assert.deepEqual(plain(r.questions.map((q) => q.name)), ["(이름 없음, 2열)", "Q3"]);
});

test("머리글만 있으면 모두 0, 평균 -", () => {
  const r = tally("번호\tQ1\tQ2\n");
  assert.equal(r.error, null);
  assert.equal(r.respondents, 0);
  assert.deepEqual(row(r, "Q1"), { valid: 0, average: "-", blank: 0, excluded: 0 });
});

test("빈 입력·문항 없는 입력은 오류 표시", () => {
  assert.equal(tally("").error, "empty");
  assert.equal(tally("\r\n\n").error, "empty");
  assert.equal(tally("응답번호\n1\n2\n").error, "no-questions");
});

test("큰 자료도 정확히 센다", () => {
  const lines = ["번호\tQ1"];
  for (let i = 1; i <= 1000; i++) lines.push(i + "\t" + ((i % 5) + 1));
  const r = tally(lines.join("\r\n"));
  assert.deepEqual(row(r, "Q1"), { valid: 1000, average: "3.00", blank: 0, excluded: 0 });
});
