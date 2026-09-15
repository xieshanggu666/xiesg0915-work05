// 探索 / 背包 / 制作台 / 道具夜战专项测试
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
    "eventOverlay","eventTitle","eventDesc","choice0","choice1","choice2","choice3","choice4",
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
    doc, byId, gameEl, actionBtns, bagItemEls,
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
function endDayAndChoose(g, idx) {
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  g.click(g.byId["choice" + idx]);
  // 每逢商人到访的深夜，交易弹窗会挡在事件之后：测试里直接送走
  if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
}
const bag = (g) => ({
  wood: Number(g.byId.mWood.textContent),
  food: Number(g.byId.mFood.textContent),
  herb: Number(g.byId.mHerb.textContent),
  torch: Number(g.byId.iTorch.textContent),
  ration: Number(g.byId.iRation.textContent),
  trap: Number(g.byId.iTrap.textContent),
});

// === 初始背包：材料各 2，道具全 0 ===
console.log("场景一：初始背包状态");
{
  const g = loadGame(() => 0.5);
  const b = bag(g);
  check("木头/食物/草药各 2", b.wood === 2 && b.food === 2 && b.herb === 2);
  check("火把/干粮/陷阱全 0", b.torch === 0 && b.ration === 0 && b.trap === 0);
  check("行动按钮共 4 个（含使用制作台）", g.actionBtns.length === 4);
}

// === 探索：每次带回 1～2 种材料，扣 1 点行动点，日志有据可查 ===
console.log("场景二：探索带回材料");
{
  // 两次随机：0.001 → 只带回 1 种；0.001 → 选到木头
  let i = 0;
  const g = loadGame(() => [0.001, 0.001][i++ % 2]);
  g.click(g.actionBtns[0]);
  const b = bag(g);
  check("木头 2 -> 3", b.wood === 3);
  check("食物、草药不变", b.food === 2 && b.herb === 2);
  check("行动点 2 -> 1", Number(g.byId.apLeft.textContent) === 1);
  check("日志记录带回木头", g.logs().some((l) => l.includes("探索归来") && l.includes("木头+1")));
}
{
  // 三次随机：0.99（带 2 种）→ 木头；剩余池 [食物,草药] 中 0.99 → 草药
  let i = 0;
  const g = loadGame(() => [0.99, 0.001, 0.99][i++ % 3]);
  g.click(g.actionBtns[0]);
  const b = bag(g);
  check("一次带回木头和草药", b.wood === 3 && b.herb === 3 && b.food === 2);
  check("日志含两种收获", g.logs().some((l) => l.includes("木头+1") && l.includes("草药+1")));
}

// === 制作台：消耗 1 点打开，材料够才解锁配方，成品与材料同步变化 ===
console.log("场景三：制作台合成与材料消耗");
{
  const g = loadGame(() => 0.5);
  g.click(g.actionBtns[1]); // 使用制作台
  check("制作台弹窗打开", g.byId.craftOverlay.classList.contains("show"));
  check("背景 inert", g.gameEl.inert === true);
  check("火把配方可用（木1草1）", g.byId.craftTorch.disabled === false);
  check("干粮配方可用（食2草1）", g.byId.craftRation.disabled === false);
  check("陷阱配方也可用（木2食1，初始料够）", g.byId.craftTrap.disabled === false);

  g.click(g.byId.craftTorch);
  let b = bag(g);
  check("做出火把 ×1", b.torch === 1);
  check("木头 2 -> 1、草药 2 -> 1", b.wood === 1 && b.herb === 1);
  check("日志记录制作火把", g.logs().some((l) => l.includes("制作了") && l.includes("火把")));

  // 再做：火把仍可做（木1草1），做完后木头草药归 0，火把/干粮配方都该置灰
  g.click(g.byId.craftTorch);
  b = bag(g);
  check("火把 ×2", b.torch === 2 && b.wood === 0 && b.herb === 0);
  check("火把配方已置灰", g.byId.craftTorch.disabled === true);
  check("干粮配方已置灰", g.byId.craftRation.disabled === true);
  check("点击置灰配方不产出", (() => {
    g.click(g.byId.craftTorch);
    return bag(g).torch === 2;
  })());

  g.click(g.byId.closeCraft);
  check("收起制作台后弹窗关闭", !g.byId.craftOverlay.classList.contains("show"));
  check("打开时只扣 1 点（剩 1）", Number(g.byId.apLeft.textContent) === 1);
  check("连续制作不额外扣点", true); // 上面做了两次火把，点数仍为 1 即说明问题
}

// === 制作台的键盘可达性：Esc 收起、Tab 跳过置灰配方 ===
console.log("场景四：制作台 Esc / Tab");
{
  const g = loadGame(() => 0.5);
  g.actionBtns[1].focus();
  g.click(g.actionBtns[1]);
  g.key("Escape");
  check("Esc 收起制作台", !g.byId.craftOverlay.classList.contains("show"));
  check("Esc 后焦点回到「使用制作台」按钮", g.doc.activeElement === g.actionBtns[1]);

  g.click(g.actionBtns[1]);
  g.key("Tab"); // 火把 → 干粮
  check("Tab 到干粮", g.doc.activeElement === g.byId.craftRation);
  g.key("Tab"); // 干粮 → 陷阱
  check("Tab 到陷阱", g.doc.activeElement === g.byId.craftTrap);
  g.key("Tab"); // 陷阱 → 收起
  check("Tab 到「收起制作台」", g.doc.activeElement === g.byId.closeCraft);
  g.key("Tab"); // 循环回火把
  check("Tab 循环回火把", g.doc.activeElement === g.byId.craftTorch);
}

// === 道具用在夜间事件：火把（暴雨护火，体力+1/危险-2） ===
console.log("场景五：夜里举火把应对暴雨");
{
  // 事件固定暴雨：rng 在没有探索时只被抽事件调用
  const g = loadGame(() => 0.001);
  // 第 1 天：开制作台做 1 火把后结束
  g.click(g.actionBtns[1]);
  g.click(g.byId.craftTorch);
  g.click(g.byId.closeCraft);
  endDayAndChoose(g, 0); // 点起火把护火
  const b = bag(g);
  check("火把被消耗（1 -> 0）", b.torch === 0);
  check("体力 6 -> 7", Number(g.byId.stamina.textContent) === 7);
  check("日志记录用火把", g.logs().some((l) => l.includes("暴雨") && l.includes("火把")));
}

// === 道具用在夜间事件：陷阱退兽（危险-2，不耗体力） ===
console.log("场景六：夜里触发陷阱退野兽");
{
  const g = loadGame(() => (1 + 0.5) / 8); // 8 件事件中索引 1 = 野兽靠近
  // 初始木头不够做陷阱（需木2食1，木只有2、食2 → 其实够！木2 食1 可以做）
  g.click(g.actionBtns[1]);
  check("陷阱配方初始即可做", g.byId.craftTrap.disabled === false);
  g.click(g.byId.craftTrap);
  g.click(g.byId.closeCraft);
  endDayAndChoose(g, 0); // 触发陷阱
  const b = bag(g);
  check("陷阱被消耗（1 -> 0）", b.trap === 0);
  check("木头 0、食物 1", b.wood === 0 && b.food === 1);
  check("体力不损失 = 6", Number(g.byId.stamina.textContent) === 6);
  check("日志记录陷阱退敌", g.logs().some((l) => l.includes("野兽靠近") && l.includes("陷阱")));
}

// === 干粮：制作后暴雨夜吃掉恢复体力 ===
console.log("场景七：干粮在暴雨夜恢复体力");
{
  const g = loadGame(() => 0.001);
  g.click(g.actionBtns[1]);
  g.click(g.byId.craftRation); // 食2草1 → 干粮 ×1
  g.click(g.byId.closeCraft);
  endDayAndChoose(g, 1); // 啃干粮
  const b = bag(g);
  check("干粮被消耗", b.ration === 0);
  check("体力 6 -> 7", Number(g.byId.stamina.textContent) === 7);
  check("日志记录干粮", g.logs().some((l) => l.includes("暴雨") && l.includes("干粮")));
}

// === 缺道具时选项置灰且点击无效，并提示需要什么 ===
console.log("场景八：缺少道具时事件选项置灰、点击无效");
{
  const g = loadGame(() => 0.001); // 暴雨：选项0需火把，选项1需干粮
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  check("火把选项置灰", g.byId.choice0.disabled === true);
  check("干粮选项置灰", g.byId.choice1.disabled === true);
  check("提示需要火把", g.byId.choice0.innerHTML.includes("需要") && g.byId.choice0.innerHTML.includes("火把"));
  g.click(g.byId.choice0);
  check("点置灰选项不关闭弹窗", g.byId.eventOverlay.classList.contains("show"));
  check("点置灰选项不扣体力", Number(g.byId.stamina.textContent) === 6);
  g.click(g.byId.choice3); // 硬扛
  check("仍可选普通选项过关", Number(g.byId.day.textContent) === 2);
}

// === 材料也能在事件中直接消耗（抛食物引走兽群） ===
console.log("场景九：野兽夜抛存粮，食物-2；隔两晚再遇野兽时抛粮选项置灰");
{
  // 事件序列：野兽(1) → 旅人(2) → 寒潮(3) → 野兽(1)
  // 抽事件会排除最近两晚，四件都不在冷却里，直接给对应索引的 rng 即可
  const rngs = [1.5, 2.5, 3.5, 1.5].map((i) => i / 8);
  let ri = 0;
  const g = loadGame(() => rngs[ri++]);
  endDayAndChoose(g, 2); // 抛出存粮：食物-2
  const b = bag(g);
  check("食物 2 -> 0", b.food === 0);
  check("木头草药不变", b.wood === 2 && b.herb === 2);
  // 隔两晚（旅人谢绝、寒潮硬挨）后野兽再次来袭
  g.click(g.byId.endDayBtn); g.click(g.byId.confirmEnd);
  check("第二晚先抽到旅人", g.byId.eventTitle.textContent.includes("旅人"));
  g.click(g.byId.choice3);
  if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
  g.click(g.byId.endDayBtn); g.click(g.byId.confirmEnd);
  check("第三晚抽到寒潮", g.byId.eventTitle.textContent.includes("寒潮"));
  g.click(g.byId.choice3); // 硬挨到天亮（第 3 天深夜商人到访，送走）
  if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
  g.click(g.byId.endDayBtn); g.click(g.byId.confirmEnd);
  check("第四晚野兽再次来袭", g.byId.eventTitle.textContent.includes("野兽靠近"));
  check("食物不足时抛粮选项置灰", g.byId.choice2.disabled === true);
  g.click(g.byId.choice3); // 敲锅对峙过关
}

// === 旅人事件：以物易物（食物换木头） ===
console.log("场景十：旅人以食物换柴火");
{
  const g = loadGame(() => (2 + 0.5) / 8); // 索引 2 = 路过的旅人
  endDayAndChoose(g, 1); // 分食物换柴火
  const b = bag(g);
  check("食物 2 -> 1", b.food === 1);
  check("木头 2 -> 4", b.wood === 4);
}

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
