// 生存结局与纪录专项测试：
// 体力归零 / 危险顶格触发结局、生存天数与评语、localStorage 最佳纪录、纪录弹窗、再来一局
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

// 内存版 localStorage，可预填数据、可跨「会话」共享
function makeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

const BEST_KEY = "camp-survival-best";

function loadGame(randFn, storage) {
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
  const docHandlers = {};
  const doc = {
    activeElement: null,
    _logs: [],
    getElementById: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => null,
    addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
  };
  const byId = Object.fromEntries(ids.map((id) => [id, makeEl(doc, id)]));
  doc.getElementById = (id) => byId[id];
  // 模拟真实 DOM：log.innerHTML = "" 会清空日志子节点
  Object.defineProperty(byId.log, "innerHTML", {
    get() { return this._html || ""; },
    set(v) { this._html = v; if (v === "") doc._logs.length = 0; },
  });
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
  vm.runInNewContext(script, { document: doc, console, Math: TestMath, localStorage: storage });
  return {
    doc, byId, gameEl, actionBtns,
    click: (el) => el._dispatch("click", { target: el, preventDefault() {} }),
    key: (k, opts = {}) =>
      (docHandlers.keydown || []).forEach((fn) =>
        fn({ key: k, shiftKey: !!opts.shift, preventDefault() {}, target: doc.activeElement })
      ),
    logs: () => doc._logs,
  };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}
// 结束一天并选择事件选项（初始 2 点行动点，走「放弃点数并结束」确认）
function endDayAndChoose(g, choiceIdx) {
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
  stamina: Number(g.byId.stamina.textContent),
  danger: Number(g.byId.danger.textContent),
});
const bestIn = (storage) => JSON.parse(storage.getItem(BEST_KEY) || "null");

// === 体力归零：结局弹窗、天数、评语、新纪录写入、背景锁死 ===
console.log("场景一：体力归零触发「体力耗尽」结局并写入纪录");
{
  const storage = makeStorage();
  const g = loadGame(() => 0.001, storage); // 事件天天暴雨；探索 rng 同样落在低位
  for (let i = 0; i < 6; i++) endDayAndChoose(g, 3); // 硬扛：体力-1，危险+1

  check("结局弹窗已打开", g.byId.overOverlay.classList.contains("show"));
  check("标题为「体力耗尽」", g.byId.overTitle.textContent.includes("体力耗尽"));
  check("生存天数 = 6", Number(g.byId.overDays.textContent) === 6);
  check("结局评语非空", g.byId.overEval.textContent.length > 0);
  check("首次开局显示「新纪录」徽章", g.byId.newRecordBadge.hidden === false);
  check("历史最佳显示 6 天", g.byId.overBest.textContent.includes("6 天"));
  const rec = bestIn(storage);
  check("纪录已写入本地（6 天 / exhausted）", rec && rec.days === 6 && rec.ending === "exhausted");
  check("纪录带有日期", rec && /^\d{4}-\d{2}-\d{2}$/.test(rec.date));
  check("日志记录本局结束", g.logs().some((l) => l.includes("体力耗尽") && l.includes("本局结束")));
  check("背景已 inert", g.gameEl.inert === true);
  check("焦点在「再来一局」上", g.doc.activeElement === g.byId.restartBtn);

  // 结局后一切背景操作失效
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  g.click(g.actionBtns[0]);
  g.key("Escape");
  check("结局后结束当日无效（仍第 7 天）", Number(g.byId.day.textContent) === 7);
  check("结局后行动不扣点（仍 2 点）", Number(g.byId.apLeft.textContent) === 2);
  check("结局后 Esc 关不掉结局框", g.byId.overOverlay.classList.contains("show"));
  check("结束当日按钮已禁用", g.byId.endDayBtn.disabled === true);
}

// === 危险顶格：交替选项稳住体力，危险累积到 10 触发「危险爆发」 ===
console.log("场景二：危险顶格触发「危险爆发」结局");
{
  const storage = makeStorage();
  // 事件固定暴雨；每天的探索固定带回「食物 + 草药」两种（4 次 rng/天：数量、选材、选材、抽事件）
  let call = 0;
  const g = loadGame(() => {
    call++;
    const phase = call % 4;
    if (phase === 0) return 0.001; // 抽事件 → 暴雨
    if (phase === 1) return 0.6;   // 探索收获 2 种
    if (phase === 2) return 0.5;   // 第一种选到食物
    return 0.7;                    // 第二种从木头/草药中选到草药
  }, storage);
  // 第 2/4/6/8/10 天雨夜啃干粮（体力+1），其余 10 天硬扛（体力-1、危险+1）：
  // 第 15 天恰好第 10 次硬扛，危险顶格而体力还剩 1。
  const rationDays = new Set([2, 4, 6, 8, 10]);
  for (let day = 1; day <= 15; day++) {
    g.click(g.actionBtns[0]); // 探索
    g.click(g.actionBtns[1]); // 使用制作台
    if (!g.byId.craftRation.disabled) g.click(g.byId.craftRation);
    g.click(g.byId.closeCraft);
    endDayAndChoose(g, rationDays.has(day) ? 1 : 3);
  }
  check("结局弹窗已打开", g.byId.overOverlay.classList.contains("show"));
  check("标题为「危险爆发」", g.byId.overTitle.textContent.includes("危险爆发"));
  check("生存天数 = 15", Number(g.byId.overDays.textContent) === 15);
  check("危险顶格 = 10", stats(g).danger === 10);
  check("靠干粮吊着，体力还剩 1", stats(g).stamina === 1);
  check("危险卡片高亮", g.byId.dangerStat.classList.contains("high"));
  const rec = bestIn(storage);
  check("纪录写入 15 天 / overrun", rec && rec.days === 15 && rec.ending === "overrun");
}

// === 未破纪录：保留旧纪录，不亮新纪录徽章 ===
console.log("场景三：成绩不如历史最佳时，旧纪录原样保留");
{
  const storage = makeStorage({
    [BEST_KEY]: JSON.stringify({ days: 10, ending: "overrun", date: "2026-01-01" }),
  });
  const g = loadGame(() => 0.001, storage);
  for (let i = 0; i < 6; i++) endDayAndChoose(g, 3); // 只活 6 天
  check("结局弹窗已打开", g.byId.overOverlay.classList.contains("show"));
  check("不显示「新纪录」徽章", g.byId.newRecordBadge.hidden === true);
  check("历史最佳仍显示 10 天", g.byId.overBest.textContent.includes("10 天"));
  const rec = bestIn(storage);
  check("本地纪录未被覆盖（仍 10 天）", rec && rec.days === 10 && rec.date === "2026-01-01");
}

// === 破了纪录：徽章亮起，存储更新 ===
console.log("场景四：打破历史最佳时更新纪录");
{
  const storage = makeStorage({
    [BEST_KEY]: JSON.stringify({ days: 3, ending: "exhausted", date: "2026-01-01" }),
  });
  const g = loadGame(() => 0.001, storage);
  for (let i = 0; i < 6; i++) endDayAndChoose(g, 3);
  check("显示「新纪录」徽章", g.byId.newRecordBadge.hidden === false);
  const rec = bestIn(storage);
  check("本地纪录更新为 6 天", rec && rec.days === 6);
}

// === 纪录弹窗：游戏中随时翻看；跨「会话」也能读到 ===
console.log("场景五：纪录弹窗随时可查，且跨会话持久");
{
  const storage = makeStorage();
  // 第一局：活 6 天写下纪录
  const g1 = loadGame(() => 0.001, storage);
  for (let i = 0; i < 6; i++) endDayAndChoose(g1, 2);

  // 重新加载游戏（模拟下次打开），同一份存储
  const g2 = loadGame(() => 0.5, storage);
  g2.byId.recordBtn.focus();
  g2.click(g2.byId.recordBtn);
  check("纪录弹窗已打开", g2.byId.recordOverlay.classList.contains("show"));
  check("显示最长生存 6 天", Number(g2.byId.recordDays.textContent) === 6);
  check("显示结局与日期", g2.byId.recordMeta.textContent.includes("体力耗尽"));
  check("打开期间背景 inert", g2.gameEl.inert === true);
  check("焦点进入「关闭」按钮", g2.doc.activeElement === g2.byId.closeRecord);
  g2.key("Escape");
  check("Esc 关闭纪录弹窗", !g2.byId.recordOverlay.classList.contains("show"));
  check("关闭后背景解除 inert", g2.gameEl.inert === false);
  check("焦点还给纪录按钮", g2.doc.activeElement === g2.byId.recordBtn);

  // 弹窗关闭后游戏可正常进行
  g2.click(g2.actionBtns[0]);
  check("关闭后行动正常扣点（剩 1）", Number(g2.byId.apLeft.textContent) === 1);
}

// === 没有任何纪录时的弹窗文案 ===
console.log("场景六：无纪录时的占位展示");
{
  const g = loadGame(() => 0.001, makeStorage());
  g.click(g.byId.recordBtn);
  check("天数显示占位符", g.byId.recordDays.textContent === "–");
  check("提示还没有纪录", g.byId.recordMeta.textContent.includes("还没有"));
  g.click(g.byId.closeRecord);
  check("点「关闭」可关掉弹窗", !g.byId.recordOverlay.classList.contains("show"));
}

// === 再来一局：状态全重置，可以重新开局 ===
console.log("场景七：结局后「再来一局」重置全部状态");
{
  const storage = makeStorage();
  const g = loadGame(() => 0.001, storage);
  for (let i = 0; i < 6; i++) endDayAndChoose(g, 3); // 打到结局
  check("结局弹窗已打开", g.byId.overOverlay.classList.contains("show"));

  g.click(g.byId.restartBtn);
  check("结局弹窗关闭", !g.byId.overOverlay.classList.contains("show"));
  check("回到第 1 天", Number(g.byId.day.textContent) === 1);
  check("体力恢复 6", stats(g).stamina === 6);
  check("危险清零", stats(g).danger === 0);
  check("材料恢复为各 2", stats(g).wood === 2 && stats(g).food === 2 && stats(g).herb === 2);
  check("道具清零", Number(g.byId.iTorch.textContent) === 0 &&
    Number(g.byId.iRation.textContent) === 0 && Number(g.byId.iTrap.textContent) === 0);
  check("行动点恢复 2", Number(g.byId.apLeft.textContent) === 2);
  check("日志已清空并留下新开局记录", g.logs().length === 1 && g.logs()[0].includes("新的一局"));
  check("结束当日按钮恢复可用", g.byId.endDayBtn.disabled === false);

  // 新一局可以正常推进
  endDayAndChoose(g, 3);
  check("新一局能正常进入第 2 天", Number(g.byId.day.textContent) === 2);
  check("旧纪录（6 天）仍在本地", bestIn(storage).days === 6);
}

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
