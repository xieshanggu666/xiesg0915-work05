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
    "eventOverlay","eventTitle","eventDesc","choice0","choice1","choice2","choice3","choice4",
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

// 事件表顺序：暴雨0 野兽1 旅人2 寒潮3 发烧4 虫群5 补给箱6 鬼火7
const EVENT_IDS = ["storm", "beasts", "traveler", "cold", "fever", "insects", "cache", "wisp"];
const EVENT_N = EVENT_IDS.length;
// 与游戏内抽事件同构的 rng 序列：给定希望抽到的事件 id 序列，产出对应的 Math.random()。
// 游戏逻辑为「全表等概率抽 → 命中最近两晚就重抽」，所以冷却中的事件先补若干
// 指向它们的 rng（触发重抽），再给一个指向目标事件的 rng。
// 单晚抽一件、开局无历史：直接返回指向目标事件的 rng
const forcedEventRng = (seq) => {
  const target = Array.isArray(seq) ? EVENT_IDS.indexOf(seq[seq.length - 1]) : EVENT_IDS.indexOf(seq);
  return (target + 0.5) / EVENT_N;
};
// 带前置探索随机数（每次探索 3 次 rng）的序列生成器：探索值 + 当晚事件 rng（可能多次重抽）交错
function scheduleRng(exploreByDay, eventSeq) {
  const perNight = [];
  const recent = [];
  eventSeq.forEach((targetId) => {
    const target = EVENT_IDS.indexOf(targetId);
    const rngs = [];
    for (let k = 0; k < target; k++) {
      if (recent.includes(EVENT_IDS[k])) rngs.push((k + 0.5) / EVENT_N);
    }
    rngs.push((target + 0.5) / EVENT_N);
    recent.push(targetId);
    if (recent.length > 2) recent.shift();
    perNight.push(rngs);
  });
  const vals = [];
  perNight.forEach((rngs, i) => {
    (exploreByDay[i] || []).forEach((v) => vals.push(v));
    rngs.forEach((v) => vals.push(v));
  });
  let i = 0;
  return () => vals[i++ % vals.length];
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
  const g = loadGame(() => forcedEventRng(["beasts"]));
  endDayAndChoose(g, 2); // 抛出存粮：食物-2，危险-1 -> 食物 0
  const s = stats(g);
  check("食物 2 -> 0", s.food === 0);
  check("木头草药不变 = 2", s.wood === 2 && s.herb === 2);
  check("危险 0 不减穿（钳制）= 0", s.danger === 0);
  check("日志含「野兽靠近」", g.logs().some((l) => l.includes("野兽靠近")));
}

console.log("场景三：路过的旅人（rng 命中索引 2）");
{
  const g = loadGame(() => forcedEventRng(["traveler"]));
  endDayAndChoose(g, 3); // 婉言谢绝：无变化
  const s = stats(g);
  check("材料三项均不变", s.wood === 2 && s.food === 2 && s.herb === 2);
  check("体力与危险不变", s.stamina === 6 && s.danger === 0);
  check("日志记录「无变化」", g.logs().some((l) => l.includes("旅人") && l.includes("无变化")));
}

console.log("场景四：旅人以草药换体力 草药-1、体力+1");
{
  const g = loadGame(() => forcedEventRng(["traveler"]));
  endDayAndChoose(g, 2);
  const s = stats(g);
  check("草药 2 -> 1", s.herb === 1);
  check("体力 6 -> 7", s.stamina === 7);
  check("危险不变 = 0", s.danger === 0);
}

// === 连续多日硬扛：体力归零触发结局，之后的操作全部失效 ===
console.log("场景五：寒潮/暴雨轮流硬扛，体力归零触发「体力耗尽」结局");
{
  // 寒潮（缩成团：体力-2、危险+1）与暴雨（蒙头硬扛：体力-1、危险+1）轮替
  const seq = [];
  for (let i = 0; i < 12; i++) seq.push(i % 2 === 0 ? "cold" : "storm");
  const choices = [3, 3]; // 两事件的「硬扛」选项都在第 4 项
  const g = loadGame(scheduleRng([], seq));
  let nights = 0;
  while (!g.byId.overOverlay.classList.contains("show") && nights < 12) {
    endDayAndChoose(g, choices[nights % 2]);
    nights++;
  }
  const s = stats(g);
  check("第 4 天深夜体力归零（-2/-1/-2/-1）", nights === 4);
  check("体力钳制 ≥ 0（不为负）", s.stamina === 0);
  check("结局弹窗出现", g.byId.overOverlay.classList.contains("show"));
  check("结局为「体力耗尽」", g.byId.overTitle.textContent.includes("体力耗尽"));
  check("生存天数定格在 4 天", Number(g.byId.overDays.textContent) === 4);
  check("危险停在 4（结局后不再累积）", s.danger === 4);
  check("天数停在第 5 天（不再推进）", Number(g.byId.day.textContent) === 5);
  check("材料未参与结算（各 2）", s.wood === 2 && s.food === 2 && s.herb === 2);
}

// === 每日恰好抽一件：三天应得到三条事件日志 ===
console.log("场景六：每结束一日抽一件事件");
{
  const seq = ["storm", "beasts", "traveler"]; // 暴雨 → 野兽 → 旅人
  const g = loadGame(scheduleRng([], seq));
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
  const g = loadGame(scheduleRng([[0.001, 0.001]], ["storm"]));
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

// === 抽事件避开最近两晚：用固定种子的真随机序列连抽多晚，任何事件都不与前两晚重复 ===
console.log("场景八：固定种子 PRNG 连抽多晚，事件不与最近两晚重复");
{
  // mulberry32：确定性伪随机，模拟真实玩家遇到的随机流（恒定 rng 下任何算法都无法去重）
  let seed = 20260915 >>> 0;
  const rng = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const g = loadGame(rng);
  // 每种事件优先选不耗体力的选项（按当前背包可用性依次回退），保证能撑过多晚
  const prefers = {
    "暴雨": [4, 2],          // 木料垫高 → 冒雨加固
    "野兽靠近": [2, 4, 3],    // 抛存粮 → 撒草药 → 敲锅对峙
    "路过的旅人": [3],        // 婉言谢绝
    "寒潮": [4, 2],          // 木料挡风墙 → 捡柴生火
    "发烧": [4, 0, 3],       // 嚼草药 → 煎药汤 → 硬扛
    "虫群来袭": [0, 4, 3],    // 草药熏烟 → 挪篝火 → 蒙头拍虫
    "林间补给箱": [3, 4],     // 绕开（不动体力）→ 小心拆扣
    "鬼火": [4],             // 屏息等它飘走
  };
  const titleOf = () =>
    g.byId.eventTitle.textContent.replace(/^\S+\s*/, "");
  const titles = [];
  for (let i = 0; i < 10; i++) {
    g.click(g.byId.endDayBtn);
    g.click(g.byId.confirmEnd);
    const t = titleOf();
    titles.push(t);
    const pick = (prefers[t] || [3]).find((idx) => !g.byId["choice" + idx].disabled);
    g.click(g.byId["choice" + pick]);
    if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
    if (g.byId.overOverlay.classList.contains("show")) break;
  }
  check("连抽至少 8 晚才结束（角色未因选项暴毙）", titles.length >= 8);
  let noRecentRepeat = true;
  for (let i = 1; i < titles.length; i++) {
    if (titles[i] === titles[i - 1]) noRecentRepeat = false;
    if (i >= 2 && titles[i] === titles[i - 2]) noRecentRepeat = false;
  }
  check("没有任何事件与前一晚或前两晚重复", noRecentRepeat);
  check("8 件事件中至少登场过 6 件", new Set(titles).size >= 6);
}

// === 新增事件都能抽到，且各自的第五选项结算正确 ===
console.log("场景九：寒潮第五选项「木料挡风墙」木-1、危险-1");
{
  const g = loadGame(() => forcedEventRng(["cold"]));
  endDayAndChoose(g, 4);
  const s = stats(g);
  check("木头 2 -> 1", s.wood === 2 - 1);
  check("危险钳在 0", s.danger === 0);
  check("体力不变 = 6", s.stamina === 6);
  check("日志记录「寒潮」", g.logs().some((l) => l.includes("寒潮")));
}

console.log("场景十：补给箱第二选项 干粮-1、食物+2");
{
  const g = loadGame(() => forcedEventRng(["cache"]));
  g.click(g.actionBtns[1]); // 开制作台
  g.click(g.byId.craftRation); // 食2草1 → 干粮 ×1
  g.click(g.byId.closeCraft);
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  g.click(g.byId.choice1); // 留干粮谢礼：干粮-1、食物+2（食 0+2=2）
  if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
  const s = stats(g);
  check("干粮被消耗 = 0", s.ration === 0);
  check("食物 0 -> 2", s.food === 2);
  check("日志记录「林间补给箱」", g.logs().some((l) => l.includes("林间补给箱")));
}

console.log("场景十一：鬼火第五选项「屏息等它飘走」无变化，且无需任何道具");
{
  const g = loadGame(() => forcedEventRng(["wisp"]));
  g.click(g.byId.endDayBtn);
  g.click(g.byId.confirmEnd);
  check("第五选项在初始背包下可点（无负向消耗）", g.byId.choice4.disabled === false);
  g.click(g.byId.choice4);
  if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
  const s = stats(g);
  check("材料三项均不变", s.wood === 2 && s.food === 2 && s.herb === 2);
  check("体力与危险不变", s.stamina === 6 && s.danger === 0);
  check("日志记录「无变化」", g.logs().some((l) => l.includes("鬼火") && l.includes("无变化")));
}

// === 每件事件都有 5 个选项，且至少一个在初始背包下可用（不会卡死） ===
console.log("场景十二：8 件事件各 5 个选项，初始背包都能做出选择");
{
  const seq = EVENT_IDS.slice(); // 一晚一件，互不重复
  const g = loadGame(scheduleRng([], seq));
  let allWellFormed = true;
  for (let n = 0; n < seq.length; n++) {
    g.click(g.byId.endDayBtn);
    g.click(g.byId.confirmEnd);
    const visible = [0, 1, 2, 3, 4].filter((i) => !g.byId["choice" + i].hidden);
    if (visible.length !== 5) allWellFormed = false;
    if (!visible.some((i) => !g.byId["choice" + i].disabled)) allWellFormed = false;
    // 直接点第一个可用选项过关
    const first = visible.find((i) => !g.byId["choice" + i].disabled);
    g.click(g.byId["choice" + first]);
    if (g.byId.merchantOverlay.classList.contains("show")) g.click(g.byId.closeMerchant);
    if (g.byId.overOverlay.classList.contains("show")) break;
  }
  check("每件事件都显示 5 个选项且至少一个可点", allWellFormed);
}

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
