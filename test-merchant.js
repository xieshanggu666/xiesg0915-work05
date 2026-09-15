// 流浪商人专项测试：每 3 天深夜到访、浮动行情、材料换制品、稀有物资限购、成交写日志
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
    key: (k) =>
      (docHandlers.keydown || []).forEach((fn) =>
        fn({ key: k, shiftKey: false, preventDefault() {}, target: doc.activeElement })),
    logs: () => doc._logs,
  };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}
// 结束一天并在事件里选第 idx 项；若当晚商人到访则留着弹窗（由测试自行处理）
function endDayAndChoose(g, idx) {
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  g.click(g.byId["choice" + idx]);
}
function closeMerchantIfShown(g) {
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
// rng 固定 0.99：事件必为「路过的旅人」，选第 4 项「婉言谢绝」不影响任何数值
const VISIT_CHOICE = 3;

// === 商人每 3 天来一次：第 1、2 天不来，第 3 天深夜事件后到访 ===
console.log("场景一：第 3 天深夜商人才到访，来时锁定背景");
{
  const g = loadGame(() => 0.99);
  endDayAndChoose(g, VISIT_CHOICE); // 第 1 天
  check("第 1 天商人没来", !g.byId.merchantOverlay.classList.contains("show"));
  endDayAndChoose(g, VISIT_CHOICE); // 第 2 天
  check("第 2 天商人没来", !g.byId.merchantOverlay.classList.contains("show"));
  endDayAndChoose(g, VISIT_CHOICE); // 第 3 天
  check("第 3 天事件后商人弹窗打开", g.byId.merchantOverlay.classList.contains("show"));
  check("事件弹窗已先关闭", !g.byId.eventOverlay.classList.contains("show"));
  check("背景已 inert", g.gameEl.inert === true);
  check("日志记录商人到访（记在第 3 天）",
    g.logs().some((l) => l.includes("第 3 天深夜") && l.includes("流浪商人到访")));
  check("焦点落在第一个可成交货物（火把）", g.doc.activeElement === g.byId.buyTorch);

  g.click(g.actionBtns[0]); // 商人在场时尝试背景行动
  check("商人在场时背景行动不扣点（仍 2）", Number(g.byId.apLeft.textContent) === 2);
  g.click(g.byId.endDayBtn);
  check("商人在场时结束当日无效（仍第 4 天前）", Number(g.byId.day.textContent) === 4);
  check("结束当日无效：商人弹窗仍在", g.byId.merchantOverlay.classList.contains("show"));
}

// === 第 3 天行情：火把 木1草1；材料换制品，可连续成交，材料花光后置灰 ===
console.log("场景二：按浮动价用材料换火把，成交写入当天日志");
{
  const g = loadGame(() => 0.99);
  for (let i = 0; i < 2; i++) endDayAndChoose(g, VISIT_CHOICE);
  endDayAndChoose(g, VISIT_CHOICE); // 第 3 天，商人到访
  check("火把行情为 🪵×1 🌿×1",
    g.byId.costBuyTorch.innerHTML.includes("🪵×1") && g.byId.costBuyTorch.innerHTML.includes("🌿×1"));

  g.click(g.byId.buyTorch);
  let s = stats(g);
  check("成交后火把 0 -> 1", s.torch === 1);
  check("付出木头、草药各 1（2 -> 1）", s.wood === 1 && s.herb === 1);
  check("食物不动 = 2", s.food === 2);
  check("日志记录成交明细（记在第 3 天）",
    g.logs().some((l) => l.includes("第 3 天深夜") && l.includes("与商人成交") &&
      l.includes("木头×1") && l.includes("草药×1") && l.includes("火把×1")));

  g.click(g.byId.buyTorch); // 再换一件：材料刚好花光
  s = stats(g);
  check("连续成交：火把 2，材料归零", s.torch === 2 && s.wood === 0 && s.herb === 0);
  check("材料花光后火把置灰", g.byId.buyTorch.disabled === true);
  g.click(g.byId.buyTorch);
  check("点置灰货物不再产出", stats(g).torch === 2);
  g.click(g.byId.closeMerchant);
  check("送走商人后弹窗关闭", !g.byId.merchantOverlay.classList.contains("show"));
  check("送客后背景解除 inert", g.gameEl.inert === false);
}

// === 稀有物资：秘药体力 +3，每次到访限购一件；材料不足时标红置灰 ===
console.log("场景三：稀有秘药限购一件，材料不足时置灰标红");
{
  const g = loadGame(() => 0.99); // 探索固定带回 草药+食物
  // 第 3 天：先探索一次（草药+1、食物+1），再结束当天引来商人
  for (let i = 0; i < 2; i++) endDayAndChoose(g, VISIT_CHOICE);
  g.click(g.actionBtns[0]); // 探索：草药 2->3、食物 2->3
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  g.click(g.byId.choice3); // 旅人：谢绝
  check("商人弹窗打开", g.byId.merchantOverlay.classList.contains("show"));
  check("第 3 天秘药行情为 🌿×3 🍖×2",
    g.byId.costBuyTonic.innerHTML.includes("🌿×3") && g.byId.costBuyTonic.innerHTML.includes("🍖×2"));
  check("探索后秘药可买", g.byId.buyTonic.disabled === false);

  g.click(g.byId.buyTonic);
  const s = stats(g);
  check("秘药下肚：体力 6 -> 9", s.stamina === 9);
  check("付出草药 3、食物 2（3->0、3->1）", s.herb === 0 && s.food === 1);
  check("日志记录稀有物资成交与效果",
    g.logs().some((l) => l.includes("与商人成交") && l.includes("秘药×1") && l.includes("体力 +3")));
  check("秘药售罄后置灰", g.byId.buyTonic.disabled === true);
  check("秘药位置显示「已成交」", g.byId.costBuyTonic.innerHTML.includes("已成交"));
  g.click(g.byId.buyTonic);
  check("限购：再点秘药不重复生效（体力仍 9）", stats(g).stamina === 9);

  // 草药已空，护身符（木2草2）买不起：置灰并标红所缺材料
  check("草药不足时护身符置灰", g.byId.buyCharm.disabled === true);
  check("所缺材料标红提示", g.byId.costBuyCharm.innerHTML.includes("lack"));
  g.click(g.byId.closeMerchant);
}

// === 护身符：危险 -2 立即生效（钳制不低于 0），同样限购 ===
console.log("场景四：稀有护身符危险 -2 并限购");
{
  const g = loadGame(() => 0.99);
  for (let i = 0; i < 2; i++) endDayAndChoose(g, VISIT_CHOICE);
  endDayAndChoose(g, VISIT_CHOICE); // 第 3 天
  g.click(g.byId.buyCharm); // 木2草2，初始材料刚好够
  const s = stats(g);
  check("护身符成交：木头 0、草药 0", s.wood === 0 && s.herb === 0);
  check("危险 -2 但不低于 0（钳制）", s.danger === 0);
  check("日志记录护身符成交", g.logs().some((l) => l.includes("护身符×1") && l.includes("危险 -2")));
  check("护身符售罄置灰", g.byId.buyCharm.disabled === true);
  g.click(g.byId.closeMerchant);
}

// === Esc 送走商人，之后行动恢复正常 ===
console.log("场景五：Esc 送客与焦点循环");
{
  const g = loadGame(() => 0.99);
  for (let i = 0; i < 2; i++) endDayAndChoose(g, VISIT_CHOICE);
  g.byId.endDayBtn.focus();
  endDayAndChoose(g, VISIT_CHOICE); // 第 3 天
  check("商人弹窗打开", g.byId.merchantOverlay.classList.contains("show"));
  g.key("Escape");
  check("Esc 送走商人", !g.byId.merchantOverlay.classList.contains("show"));
  check("背景解除 inert", g.gameEl.inert === false);
  g.click(g.actionBtns[0]); // 探索恢复可用
  check("送客后行动正常扣点（剩 1）", Number(g.byId.apLeft.textContent) === 1);
}

// === 行情浮动：同一货物不同到访日价格不同（第 3 天 木1 → 第 6 天 木2）===
console.log("场景六：行情随到访日浮动");
{
  const g = loadGame(() => 0.99);
  for (let i = 0; i < 2; i++) endDayAndChoose(g, VISIT_CHOICE);
  endDayAndChoose(g, VISIT_CHOICE); // 第 3 天
  const day3Torch = g.byId.costBuyTorch.innerHTML;
  check("第 3 天火把 🪵×1", day3Torch.includes("🪵×1"));
  g.click(g.byId.closeMerchant);
  endDayAndChoose(g, VISIT_CHOICE); // 第 4 天
  endDayAndChoose(g, VISIT_CHOICE); // 第 5 天
  check("第 4、5 天商人不来", !g.byId.merchantOverlay.classList.contains("show"));
  endDayAndChoose(g, VISIT_CHOICE); // 第 6 天
  check("第 6 天商人再次到访", g.byId.merchantOverlay.classList.contains("show"));
  const day6Torch = g.byId.costBuyTorch.innerHTML;
  check("第 6 天火把涨为 🪵×2", day6Torch.includes("🪵×2"));
  check("两次到访行情确实不同", day3Torch !== day6Torch);
  check("日志留下两次到访记录（第 3、6 天）",
    g.logs().some((l) => l.includes("第 3 天深夜") && l.includes("流浪商人到访")) &&
    g.logs().some((l) => l.includes("第 6 天深夜") && l.includes("流浪商人到访")));
  g.click(g.byId.closeMerchant);
}

// === 商人夜若事件触发结局，商人不再出现 ===
console.log("场景七：商人夜撞上结局时，商人不来");
{
  // 天天暴雨硬扛：第 6 天深夜体力归零，而第 6 天本是商人日
  const g = loadGame(() => 0.001);
  for (let i = 0; i < 6; i++) {
    g.click(g.byId.endDayBtn);
    g.click(g.byId.confirmEnd);
    g.click(g.byId.choice3); // 蒙头硬扛
    closeMerchantIfShown(g); // 第 3 天商人照常来，送走
  }
  check("结局弹窗已打开", g.byId.overOverlay.classList.contains("show"));
  check("结局当晚商人不再出现", !g.byId.merchantOverlay.classList.contains("show"));
}

// === 矮视口防回归：弹窗限高并可内部滚动，底部货物与「送走商人」够得着 ===
console.log("场景八：弹窗样式带 max-height 与纵向滚动");
{
  const html = fs.readFileSync("/workspace/index.html", "utf8");
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const modalRule = css.match(/\.modal\s*\{([^}]*)\}/)[1];
  check("弹窗限高 max-height（随视口收缩）", /max-height:\s*calc\(100vh/.test(modalRule));
  check("弹窗可纵向滚动 overflow-y: auto", /overflow-y:\s*auto/.test(modalRule));
}

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
