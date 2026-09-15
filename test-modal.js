// 最小 DOM 桩：加载 index.html 中的真实脚本，模拟键盘/点击交互
const fs = require("fs");
const vm = require("vm");

function makeEl(id = "") {
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
    prepend() {},
    // 背包格子渲染时会查 .num 子节点；桩里返回自身即可
    querySelector() { return el; },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    focus() { doc.activeElement = el; },
    _dispatch(type, ev) { (handlers[type] || []).forEach((fn) => fn(ev)); },
  };
  return el;
}

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
const byId = Object.fromEntries(ids.map((id) => [id, makeEl(id)]));
const gameEl = makeEl("game");
const actionBtns = ["explore","craft","rest","guard"].map((act, i) => {
  const b = makeEl(act);
  b.dataset = { act, cost: String(i < 3 ? 1 : 2) };
  return b;
});
const bagItemEls = Array.from({ length: 6 }, () => makeEl("bag-item"));

const docHandlers = {};
const doc = {
  activeElement: null,
  getElementById: (id) => byId[id],
  querySelector: (sel) => (sel === ".game" ? gameEl : null),
  querySelectorAll: (sel) => {
    if (sel === "[data-cost]") return actionBtns;
    if (sel === ".bag-item") return bagItemEls;
    return [];
  },
  createElement: () => makeEl(),
  addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
};

const html = fs.readFileSync("/workspace/index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// 测试中固定抽到第 1 件事件（暴雨）
const TestMath = Object.create(Math);
TestMath.random = () => 0.001;
vm.runInNewContext(script, { document: doc, console, Math: TestMath });

// ---- 测试工具 ----
const overlay = byId.confirmOverlay;
const eventOverlay = byId.eventOverlay;
const click = (el) => el._dispatch("click", { target: el, preventDefault() {} });
const key = (k, opts = {}) =>
  (docHandlers.keydown || []).forEach((fn) =>
    fn({ key: k, shiftKey: !!opts.shift, preventDefault() {}, target: doc.activeElement })
  );
const apShown = () => Number(byId.apLeft.textContent);
const remainShown = () => Number(byId.remainAp.textContent);
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}

// === 场景：剩 2 点打开确认框 ===
console.log("初始：第1天 2 点");
byId.endDayBtn.focus();
click(byId.endDayBtn);
check("弹窗已打开", overlay.classList.contains("show"));
check("弹窗显示剩余 2 点", remainShown() === 2);
check("背景已 inert（Tab/辅助技术不可达）", gameEl.inert === true);
check("焦点进入弹窗（取消按钮）", doc.activeElement === byId.cancelEnd);

// 1) 键盘 Enter 触发背景行动按钮（焦点本应到不了，这里直接派发 click 验证逻辑保险）
click(actionBtns[0]);
check("弹窗期间背景行动不扣点（仍为 2）", apShown() === 2);
check("弹窗剩余数字仍为 2（不陈旧）", remainShown() === 2);

// 2) Tab 焦点陷阱：在两个弹窗按钮间循环
key("Tab"); // cancel -> confirm
check("Tab: 焦点到「确认结束」", doc.activeElement === byId.confirmEnd);
key("Tab"); // 末尾循环回首
check("Tab: 末尾循环回「再行动一会儿」", doc.activeElement === byId.cancelEnd);
key("Tab", { shift: true }); // 反向到末尾
check("Shift+Tab: 循环到「确认结束」", doc.activeElement === byId.confirmEnd);

// 3) Esc 取消
key("Escape");
check("Esc 后弹窗关闭", !overlay.classList.contains("show"));
check("Esc 后背景解除 inert", gameEl.inert === false);
check("Esc 后点数未损失（仍 2）", apShown() === 2);
check("焦点还给触发弹窗的按钮", doc.activeElement === byId.endDayBtn);

// 4) 取消后背景行动恢复正常
click(actionBtns[0]);
check("关闭后行动可正常扣点（变为 1）", apShown() === 1);

// === 剩 1 点再次打开，确认放弃 ===
click(byId.endDayBtn);
check("再次打开弹窗显示剩余 1 点", remainShown() === 1);
click(actionBtns[1]); // 弹窗期间尝试再扣
check("弹窗期间点数保持 1", apShown() === 1 && remainShown() === 1);
click(byId.confirmEnd);
check("确认后行动点确认框关闭", !overlay.classList.contains("show"));

// === 确认结束后：先抽夜间随机事件，必须做出选择才进入新一天 ===
check("随机事件弹窗已打开", eventOverlay.classList.contains("show"));
check("事件弹窗期间背景仍 inert", gameEl.inert === true);
check("进入新一天：点数已恢复为 2（事件在新一天弹出）", apShown() === 2);
check("固定抽到「暴雨」", byId.eventTitle.textContent.includes("暴雨"));
check("事件选项按钮已显示", byId.choice0.hidden === false && byId.choice1.hidden === false);
check("没有火把/干粮时道具选项置灰", byId.choice0.disabled === true && byId.choice1.disabled === true);
check("焦点落在第一个可用选项（选项三）", doc.activeElement === byId.choice2);

click(actionBtns[0]); // 事件期间尝试背景行动
check("事件期间背景行动不扣点（保持 2）", apShown() === 2);
click(byId.endDayBtn);
check("事件期间结束当日按钮无效（事件框仍开）", eventOverlay.classList.contains("show"));
key("Escape");
check("Esc 不能关闭事件弹窗（必须选择）", eventOverlay.classList.contains("show"));

key("Tab"); // 可用选项只有三、四，Tab 在两者间循环
check("事件弹窗 Tab: 焦点到选项四", doc.activeElement === byId.choice3);
key("Tab");
check("事件弹窗 Tab: 循环回选项三", doc.activeElement === byId.choice2);

click(byId.choice2); // 暴雨：冒雨加固，体力-1、危险-1
check("选择后事件弹窗关闭", !eventOverlay.classList.contains("show"));
check("选择后进入第 2 天", Number(byId.day.textContent) === 2);
check("第 2 天点数恢复为 2", apShown() === 2);
check("选择后背景解除 inert", gameEl.inert === false);
check("选项直接改体力：6 -> 5", Number(byId.stamina.textContent) === 5);
check("焦点还给触发弹窗的按钮", doc.activeElement === byId.endDayBtn);

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
