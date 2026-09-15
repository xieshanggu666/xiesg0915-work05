// 随机事件专项测试：抽事件（暴雨/野兽/旅人）、选项结算、数值钳制、日志记录
const fs = require("fs");
const vm = require("vm");

function makeEl(doc, id = "") {
  const handlers = {};
  const el = {
    id,
    dataset: {},
    textContent: "",
    innerHTML: "",
    disabled: false,
    inert: false,
    hidden: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === undefined) force = !this._set.has(c);
        if (force) this._set.add(c); else this._set.delete(c);
      },
      contains(c) { return this._set.has(c); },
    },
    appendChild() {},
    prepend(node) { doc._logs.unshift(node.textContent); },
    querySelector() { return el; },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    focus() { doc.activeElement = el; },
    _dispatch(type, ev) { (handlers[type] || []).forEach((fn) => fn(ev)); },
  };
  return el;
}

function loadGame(randFn) {
  const ids = [
    "day","phase","pips","apLeft","apMax","confirmOverlay","remainAp","remainDay",
    "log","endDayBtn","cancelEnd","confirmEnd",
    "stamina","danger","dangerStat",
    "mWood","mFood","mHerb","iTorch","iRation","iTrap",
    "craftOverlay","closeCraft","craftTorch","craftRation","craftTrap",
    "eventOverlay","eventTitle","eventDesc","choice0","choice1","choice2","choice3",
    "overOverlay","overTitle","overDesc","overDays","overEval","overBest",
    "newRecordBadge","restartBtn","recordBtn","recordOverlay","recordDays","recordMeta","closeRecord",
    "merchantOverlay","closeMerchant","buyTorch","buyRation","buyTrap","buyTonic","buyCharm",
    "costBuyTorch","costBuyRation","costBuyTrap","costBuyTonic","costBuyCharm",
  ];
  const doc = {
    activeElement: null,
    _logs: [],
    getElementById: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => null,
    addEventListener() {},
  };
  const byId = Object.fromEntries(ids.map((id) => [id, makeEl(doc, id)]));
  doc.getElementById = (id) => byId[id];
  const gameEl = makeEl(doc, "game");
  doc.querySelector = (sel) => (sel === ".game" ? gameEl : null);
  const bagItemEls = Array.from({ length: 6 }, () => makeEl(doc, "bag-item"));
  const actionBtns = ["explore","craft","rest","guard"].map((act, i) => {
    const b = makeEl(doc, act);
    b.dataset = { act, cost: String(i < 3 ? 1 : 2) };
    return b;
  });
  doc.querySelectorAll = (sel) => {
    if (sel === "[data-cost]") return actionBtns;
    if (sel === ".bag-item") return bagItemEls;
    return [];
  };
  doc.createElement = () => makeEl(doc);
  const html = fs.readFileSync("/workspace/index.html", "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const TestMath = Object.create(Math);
  TestMath.random = randFn;
  vm.runInNewContext(script, { document: doc, console, Math: TestMath });
  return {
    doc, byId, gameEl, actionBtns,
    click: (el) => el._dispatch("click", { target: el, preventDefault() {} }),
    logs: () => doc._logs,
  };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}
function endDayAndChoose(g, choiceIdx) {
  // 初始 2 点行动点，默认走「放弃点数并结束」确认
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  g.click(g.byId["choice" + choiceIdx]);
  // 每逢商人到访的深夜，交易弹窗会挡在事件之后：测试里直接送走
  if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
}
const stats = (g) => ({
  wood: Number(g.byId.mWood.textContent),
  food: Number(g.byId.mFood.textContent),
  herb: Number(g.byId.mHerb.textContent),
  torch: Number(g.byId.iTorch.textContent),
  ration: Number(g.byId.iRation.textContent),
  trap: Number(g.byId.iTrap.textContent),
  stamina: Number(g.byId.stamina.textContent),
  danger: Number(g.byId.danger.textContent),
});

// === 三件事件都能抽到，且选项数值结算正确 ===
console.log("场景一：暴雨（rng 命中索引 0）");
{
  const g = loadGame(() => 0.001);
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  check("标题为「🌧 暴雨」", g.byId.eventTitle.textContent.includes("暴雨"));
  check("无火把/干粮时前两个道具选项置灰", g.byId.choice0.disabled && g.byId.choice1.disabled);
  g.click(g.byId.choice2); // 冒雨加固：体力-1，危险-1（危险已是 0，钳在 0）
  check("描述文本非空", g.byId.eventDesc.textContent.length > 0);
  const s = stats(g);
  check("材料保持各 2 不变", s.wood === 2 && s.food === 2 && s.herb === 2);
  check("体力 6 -> 5", s.stamina === 5);
  check("危险不会减到 0 以下（钳制）= 0", s.danger === 0);
  check("进入第 2 天", Number(g.byId.day.textContent) === 2);
  check("日志记录了事件经过", g.logs().some((l) => l.includes("暴雨") && l.includes("加固帐篷")));
}

console.log("场景二：野兽靠近（rng 命中索引 1）");
{
  const g = loadGame(() => 0.5);
  endDayAndChoose(g, 2); // 抛出存粮：食物-2，危险-1 -> 食物 0
  const s = stats(g);
  check("食物 2 -> 0", s.food === 0);
  check("木头草药不变 = 2", s.wood === 2 && s.herb === 2);
  check("危险 0 不减穿（钳制）= 0", s.danger === 0);
  check("日志含「野兽靠近」", g.logs().some((l) => l.includes("野兽靠近")));
}

console.log("场景三：路过的旅人（rng 命中索引 2）");
{
  const g = loadGame(() => 0.99);
  endDayAndChoose(g, 3); // 婉言谢绝：无变化
  const s = stats(g);
  check("材料三项均不变", s.wood === 2 && s.food === 2 && s.herb === 2);
  check("体力与危险不变", s.stamina === 6 && s.danger === 0);
  check("日志记录「无变化」", g.logs().some((l) => l.includes("旅人") && l.includes("无变化")));
}

console.log("场景四：旅人以草药换体力 草药-1、体力+1");
{
  const g = loadGame(() => 0.99);
  endDayAndChoose(g, 2);
  const s = stats(g);
  check("草药 2 -> 1", s.herb === 1);
  check("体力 6 -> 7", s.stamina === 7);
  check("危险不变 = 0", s.danger === 0);
}

// === 连续多日硬扛：体力归零触发结局，之后的操作全部失效 ===
console.log("场景五：连续暴雨硬扛，体力归零触发「体力耗尽」结局");
{
  const g = loadGame(() => 0.001); // 天天暴雨
  for (let i = 0; i < 12; i++) endDayAndChoose(g, 3); // 蒙头硬扛：体力-1，危险+1
  const s = stats(g);
  check("体力钳制 ≥ 0（不为负）", s.stamina === 0);
  check("第 6 天深夜体力归零，结局弹窗出现", g.byId.overOverlay.classList.contains("show"));
  check("结局为「体力耗尽」", g.byId.overTitle.textContent.includes("体力耗尽"));
  check("生存天数定格在 6 天", Number(g.byId.overDays.textContent) === 6);
  check("危险停在 6（结局后不再累积）", s.danger === 6);
  check("天数停在第 7 天（不再推进）", Number(g.byId.day.textContent) === 7);
  check("材料未参与结算（各 2）", s.wood === 2 && s.food === 2 && s.herb === 2);
}

// === 每日恰好抽一件：三天应得到三条事件日志 ===
console.log("场景六：每结束一日抽一件事件");
{
  const seq = [0.001, 0.5, 0.99]; // 暴雨 → 野兽 → 旅人
  let i = 0;
  const g = loadGame(() => seq[i++ % seq.length]);
  endDayAndChoose(g, 3); // 暴雨硬扛
  endDayAndChoose(g, 2); // 野兽：抛出存粮 食物-2 危险-1
  endDayAndChoose(g, 3); // 旅人谢绝
  const names = ["暴雨", "野兽靠近", "路过的旅人"];
  names.forEach((n, day) =>
    check(`第 ${day + 1} 天深夜日志含「${n}」`,
      g.logs().some((l) => l.includes(`第 ${day + 1} 天深夜`) && l.includes(n)))
  );
}

// === 行动点用完时不弹确认框，直接抽事件 ===
console.log("场景七：行动点用完 → 跳过确认，直接进入事件");
{
  const g = loadGame(() => 0.001);
  g.click(g.actionBtns[0]); // 探索 -1
  g.click(g.actionBtns[2]); // 整理营地 -1，行动点用完
  check("探索有带回材料的日志", g.logs().some((l) => l.includes("探索归来")));
  g.click(g.byId.endDayBtn);
  check("行动点用完不弹确认框", !g.byId.confirmOverlay.classList.contains("show"));
  check("直接弹出随机事件框", g.byId.eventOverlay.classList.contains("show"));
  g.click(g.byId.choice2);
  check("选择后进入第 2 天", Number(g.byId.day.textContent) === 2);
  check("日志含行动点全部用完", g.logs().some((l) => l.includes("行动点已全部用完")));
}

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
