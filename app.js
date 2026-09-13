/* 我的工作台 · 核心逻辑 */
"use strict";

/* ---------------- 工具 ---------------- */
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, "0");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function fmtDate(d) {
  if (!d) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function fmtDue(d) {
  if (!d) return "无日期";
  let s = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_CN[d.getDay()]}`;
  if (d.getHours() || d.getMinutes()) s += ` ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return s;
}

const store = {
  get(k, dflt) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

/* ---------------- 中文日期/时间识别 ---------------- */
function parseDateTime(text) {
  let s = (text || "").trim();
  let date = null;
  let time = null;

  // 时间 HH:MM
  let m = s.match(/(\d{1,2})[:：](\d{1,2})/);
  if (m) {
    time = pad(+m[1]) + ":" + pad(+m[2]);
    s = s.replace(m[0], " ");
  } else {
    // X点 / X点半 / X点一刻 / X点X分 / 上午X点 / 下午X点 / 晚上X点
    m = s.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*[点點]\s*(半|一刻|(\d{1,2})\s*分)?/);
    if (m) {
      let h = +m[2];
      const tag = m[1] || "";
      let min = 0;
      if (m[3] === "半") min = 30;
      else if (m[3] === "一刻") min = 15;
      else if (m[4]) min = +m[4];
      if ((tag.includes("下午") || tag.includes("晚上") || tag.includes("中午")) && h < 12) h += 12;
      time = pad(h % 24) + ":" + pad(min);
      s = s.replace(m[0], " ");
    }
  }

  const today = startOfDay(new Date());

  // 今天/明天/后天/大后天
  const rel = { "大后天": 3, "后天": 2, "明天": 1, "今天": 0 };
  for (const [w, off] of Object.entries(rel)) {
    if (s.includes(w)) { date = addDays(today, off); s = s.replace(w, " "); break; }
  }

  // 周X / 星期X / 下周一 / 下下周一
  if (!date) {
    m = s.match(/(下+|这|本)?\s*(?:星期|礼拜|周)\s*([一二三四五六日天])/);
    if (m) {
      const target = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }[m[2]];
      const cur = today.getDay();
      let diff = (target - cur + 7) % 7;
      if (m[1] && m[1].startsWith("下")) diff += 7 * m[1].length;
      date = addDays(today, diff);
      s = s.replace(m[0], " ");
    }
  }

  // 具体日期：2026年3月5日 / 2026-3-5 / 3月5号 / 3.5 / 3/5
  if (!date) {
    m = s.match(/(\d{4})\s*[年\-\.\/]\s*(\d{1,2})\s*[月\-\.\/]\s*(\d{1,2})\s*[日号]?/)
     || s.match(/(\d{1,2})\s*[月\-\.\/]\s*(\d{1,2})\s*[日号]?/);
    if (m) {
      let y, mo, da;
      if (m.length >= 4 && m[1].length === 4) { y = +m[1]; mo = +m[2]; da = +m[3]; }
      else { y = today.getFullYear(); mo = +m[1]; da = +m[2]; }
      date = new Date(y, mo - 1, da);
      if (date < today) date = new Date(y + 1, mo - 1, da);
      s = s.replace(m[0], " ");
    }
  }

  // X天后
  if (!date) {
    m = s.match(/(\d+)\s*天\s*[后後]/);
    if (m) { date = addDays(today, +m[1]); s = s.replace(m[0], " "); }
  }

  const title = s.replace(/\s+/g, " ").replace(/^[\s,，、。.]+|[\s,，、。.]+$/g, "").trim();
  return { date, time, title };
}

function buildDue(date, time) {
  if (!date && !time) return null;
  const d = date ? new Date(date) : new Date();
  if (time) {
    const [h, mi] = time.split(":").map(Number);
    d.setHours(h, mi, 0, 0);
  } else if (d.getHours() === 0) {
    d.setHours(18, 0, 0, 0); // 只有日期时默认傍晚 18:00
  }
  return d;
}

/* ---------------- 待办数据 ---------------- */
let todos = store.get("wb_todos", []);
let filter = "all";
const notified = new Set();

function saveTodos() { store.set("wb_todos", todos); }

function addTodo(text) {
  const t = text.trim();
  if (!t) return;
  const { date, time, title } = parseDateTime(t);
  if (!title) { toast("没听清内容，请再说一遍"); return; }
  const due = buildDue(date, time);
  todos.unshift({ id: Date.now(), text: title, due: due ? due.toISOString() : null, done: false });
  saveTodos();
  renderTodos();
  const msg = due ? `已添加：${title}（${fmtDue(due)}）` : `已添加：${title}`;
  toast(msg, 2600);
  $("#todoText").value = "";
}

function renderTodos() {
  const list = $("#todoList");
  const now = Date.now();
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  let items = todos.slice();
  if (filter === "pending") items = items.filter((t) => !t.done);
  if (filter === "done") items = items.filter((t) => t.done);

  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const da = a.due ? +new Date(a.due) : Infinity;
    const db = b.due ? +new Date(b.due) : Infinity;
    return da - db;
  });

  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<li class="empty">暂无待办，点左上角 🎤 说一句试试</li>`;
    return;
  }
  for (const t of items) {
    const due = t.due ? new Date(t.due) : null;
    const overdue = due && !t.done && due.getTime() < now;
    const dueToday = due && !t.done && due.getTime() <= todayEnd.getTime() && due.getTime() >= startOfDay(new Date()).getTime();
    const li = document.createElement("li");
    li.className = "todo-item" + (t.done ? " done" : "") + (overdue ? " overdue" : "") + (dueToday ? " due-today" : "");
    li.innerHTML = `
      <button class="todo-check" data-id="${t.id}">✓</button>
      <div class="todo-body">
        <div class="todo-text">${escapeHtml(t.text)}</div>
        <div class="todo-due">${due ? fmtDue(due) : "无日期"}</div>
      </div>
      <button class="todo-del" data-id="${t.id}">✕</button>`;
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- 语音录入 ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
if (SR) {
  rec = new SR();
  rec.lang = "zh-CN";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    stopListening();
    addTodo(text);
  };
  rec.onerror = (e) => { stopListening(); if (e.error === "not-allowed") toast("请允许使用麦克风"); else if (e.error !== "aborted") toast("语音识别出错：" + e.error); };
  rec.onend = () => stopListening();
}

function startListening() {
  if (!rec) { toast("当前浏览器不支持语音识别，请用 Chrome/Safari"); return; }
  if (listening) return;
  listening = true;
  $("#voiceBtn").classList.add("listening");
  $("#voiceStatus").textContent = "正在聆听，请说话…";
  $("#voiceStatus").classList.remove("hidden");
  try { rec.start(); } catch (e) {}
}
function stopListening() {
  listening = false;
  $("#voiceBtn").classList.remove("listening");
  $("#voiceStatus").classList.add("hidden");
  try { rec.stop(); } catch (e) {}
}

/* ---------------- 课程表 ---------------- */
// 每节默认 40 分钟、课间 15 分钟；可在“课程时间设置”里自由调整
const DEFAULT_PERIODS = [
  { start: "08:00", end: "08:40" }, { start: "08:55", end: "09:35" },
  { start: "09:50", end: "10:30" }, { start: "10:45", end: "11:25" },
  { start: "14:00", end: "14:40" }, { start: "14:55", end: "15:35" },
  { start: "15:50", end: "16:30" }, { start: "16:45", end: "17:25" },
  { start: "19:00", end: "19:40" }, { start: "19:55", end: "20:35" }
];
const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
let periods = store.get("wb_periods", DEFAULT_PERIODS);
let courses = store.get("wb_courses", []);
let editCell = null; // {day, period}

function saveCourses() { store.set("wb_courses", courses); }
function savePeriods() { store.set("wb_periods", periods); }

function renderPeriodEditor() {
  const box = $("#periodEditor");
  box.innerHTML = "";
  periods.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "period-row";
    row.innerHTML = `<span class="idx">第${i + 1}节</span>
      <input type="time" value="${p.start}" data-i="${i}" data-k="start">
      <span>-</span>
      <input type="time" value="${p.end}" data-i="${i}" data-k="end">
      <button class="del" data-i="${i}" title="删除">✕</button>`;
    box.appendChild(row);
  });
  box.querySelectorAll("input[type=time]").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      periods[+e.target.dataset.i][e.target.dataset.k] = e.target.value;
      savePeriods(); renderSchedule();
    });
  });
  box.querySelectorAll("button.del").forEach((b) => {
    b.addEventListener("click", () => {
      if (periods.length <= 1) { toast("至少保留一节"); return; }
      periods.splice(+b.dataset.i, 1);
      savePeriods(); renderPeriodEditor(); renderSchedule();
    });
  });
}

function renderSchedule() {
  const wrap = $("#scheduleWrap");
  const todayCol = (new Date().getDay() + 6) % 7; // 周一=0
  let html = `<table class="schedule"><thead><tr><th class="period-col">节次</th>`;
  DAYS.forEach((d, i) => { html += `<th class="${i === todayCol ? "today-col" : ""}">${d}</th>`; });
  html += `</tr></thead><tbody>`;
  periods.forEach((p, pi) => {
    html += `<tr><th class="period-col">第${pi + 1}节<br>${p.start}-${p.end}</th>`;
    for (let d = 0; d < 7; d++) {
      const c = courses.find((x) => x.day === d && x.period === pi);
      const cls = "cell" + (d === todayCol ? " today-col" : "");
      html += `<td class="${cls}" data-day="${d}" data-period="${pi}">`;
      if (c) html += `<div class="course-name">${escapeHtml(c.name)}</div>` + (c.loc ? `<div class="course-loc">${escapeHtml(c.loc)}</div>` : "");
      html += `</td>`;
    }
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll("td.cell").forEach((td) => {
    td.addEventListener("click", () => openCourseModal(+td.dataset.day, +td.dataset.period));
  });
}

function openCourseModal(day, period) {
  editCell = { day, period };
  const c = courses.find((x) => x.day === day && x.period === period);
  $("#courseModalTitle").textContent = `${DAYS[day]} 第${period + 1}节`;
  $("#courseName").value = c ? c.name : "";
  $("#courseLoc").value = c ? (c.loc || "") : "";
  $("#courseModal").classList.remove("hidden");
}
function closeCourseModal() { $("#courseModal").classList.add("hidden"); }

function saveCourse() {
  const name = $("#courseName").value.trim();
  const loc = $("#courseLoc").value.trim();
  if (!editCell) return;
  courses = courses.filter((x) => !(x.day === editCell.day && x.period === editCell.period));
  if (name) courses.push({ day: editCell.day, period: editCell.period, name, loc });
  saveCourses();
  renderSchedule();
  closeCourseModal();
}
function clearCourse() {
  if (!editCell) return;
  courses = courses.filter((x) => !(x.day === editCell.day && x.period === editCell.period));
  saveCourses();
  renderSchedule();
  closeCourseModal();
}

/* ---------------- 倒计时 ---------------- */
const HOLIDAYS = [
  { name: "元旦", annual: true, month: 0, day: 1 },
  { name: "春节", dates: { 2026: "2026-02-17", 2027: "2027-02-06" } },
  { name: "清明节", dates: { 2026: "2026-04-05", 2027: "2027-04-05" } },
  { name: "劳动节", annual: true, month: 4, day: 1 },
  { name: "端午节", dates: { 2026: "2026-06-19", 2027: "2027-06-09" } },
  { name: "中秋节", dates: { 2026: "2026-09-25", 2027: "2027-09-15" } },
  { name: "国庆节", annual: true, month: 9, day: 1 }
];

function holidayDate(h, year) {
  if (h.annual) return new Date(year, h.month, h.day);
  const s = h.dates[year];
  if (s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  return null;
}

function nextHoliday(h) {
  const now = startOfDay(new Date());
  const y = now.getFullYear();
  for (const year of [y, y + 1]) {
    const d = holidayDate(h, year);
    if (d && d >= now) return d;
  }
  return null;
}

function renderCountdowns() {
  const now = new Date();
  const today = startOfDay(now);

  // 今天信息
  const isHoliday = HOLIDAYS.some((h) => { const d = holidayDate(h, today.getFullYear()); return d && d.getTime() === today.getTime(); });
  const day = today.getDay();
  let kind = "工作日";
  if (day === 6 || day === 0) kind = "周末";
  else if (isHoliday) kind = "法定节假日";
  $("#todayInfo").textContent = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 ${WEEK_CN[day]} · ${kind}`;

  // 周末
  const we = $("#weekendInfo");
  if (day === 6 || day === 0) {
    we.innerHTML = `今天就是<b>周末</b> 🎉`;
  } else {
    const diff = 6 - day; // 到周六
    we.innerHTML = `距离<b>${diff}</b> 天后到周末（${fmtDate(addDays(today, diff))} 周六）`;
  }

  // 放假
  const items = HOLIDAYS.map((h) => ({ h, d: nextHoliday(h) })).filter((x) => x.d).sort((a, b) => a.d - b.d);
  const ul = $("#holidayList");
  ul.innerHTML = "";
  for (const { h, d } of items) {
    const diff = Math.round((d - today) / 86400000);
    const li = document.createElement("li");
    li.innerHTML = `<span class="name">${h.name}</span><span class="date">${d.getFullYear()}年${fmtDate(d)}</span><span class="days">${diff === 0 ? "今天" : diff + " 天"}</span>`;
    ul.appendChild(li);
  }

  renderSemester();
}

function renderSemester() {
  const cfg = store.get("wb_semester", { start: "2026-09-01", end: "2027-01-15" });
  $("#semStart").value = cfg.start;
  $("#semEnd").value = cfg.end;
  const start = new Date(cfg.start + "T00:00:00");
  const end = new Date(cfg.end + "T00:00:00");
  const now = new Date();
  const info = $("#semesterInfo");
  if (isNaN(start) || isNaN(end) || end <= start) {
    info.innerHTML = `<div style="color:var(--muted)">请设置正确的开学/放假日期</div>`;
    return;
  }
  const total = Math.round((end - start) / 86400000);
  let html = "";
  if (now < start) {
    const d = Math.round((start - now) / 86400000);
    html += `距离开学还有 <b style="color:var(--primary);font-size:22px">${d}</b> 天`;
  } else if (now > end) {
    html += `已放假 🎉`;
  } else {
    const left = Math.round((end - now) / 86400000);
    const passed = Math.round((now - start) / 86400000);
    const pct = Math.min(100, Math.round(passed / total * 100));
    html += `本学期已过 ${passed} 天，距离放假还有 <b style="color:var(--primary);font-size:22px">${left}</b> 天`;
    html += `<div class="progress"><div style="width:${pct}%"></div></div><div style="font-size:12px;color:var(--muted)">学期进度 ${pct}%（共 ${total} 天）</div>`;
  }
  info.innerHTML = html;
}

/* ---------------- 提醒检查 ---------------- */
function checkDue() {
  const now = Date.now();
  let changed = false;
  for (const t of todos) {
    if (t.done || !t.due) continue;
    const due = +new Date(t.due);
    if (due <= now && !notified.has(t.id)) {
      notified.add(t.id);
      changed = true;
      const msg = `待办提醒：${t.text}`;
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("我的工作台", { body: msg });
      } else {
        toast(`⏰ ${msg}`, 4000);
      }
    }
  }
  if (changed) renderTodos();
}

/* ---------------- 事件绑定与初始化 ---------------- */
function init() {
  // 标题可编辑
  const titleEl = $("#appTitle");
  titleEl.textContent = store.get("wb_title", "我的工作台");
  document.title = titleEl.textContent;
  titleEl.addEventListener("click", () => {
    titleEl.contentEditable = "true";
    titleEl.focus();
    const r = document.createRange();
    r.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  });
  titleEl.addEventListener("blur", () => {
    titleEl.contentEditable = "false";
    const t = titleEl.textContent.replace(/\s+/g, " ").trim() || "我的工作台";
    titleEl.textContent = t;
    document.title = t;
    store.set("wb_title", t);
  });
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); }
  });

  // Tab 切换
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("#tab-" + btn.dataset.tab).classList.add("active");
  });

  // 待办
  $("#addBtn").addEventListener("click", () => addTodo($("#todoText").value));
  $("#todoText").addEventListener("keydown", (e) => { if (e.key === "Enter") addTodo($("#todoText").value); });
  $("#voiceBtn").addEventListener("click", startListening);
  $("#todoList").addEventListener("click", (e) => {
    const id = +e.target.dataset.id;
    if (e.target.classList.contains("todo-check")) {
      const t = todos.find((x) => x.id === id);
      if (t) { t.done = !t.done; saveTodos(); renderTodos(); }
    } else if (e.target.classList.contains("todo-del")) {
      todos = todos.filter((x) => x.id !== id);
      notified.delete(id);
      saveTodos(); renderTodos();
    }
  });
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      filter = c.dataset.filter;
      renderTodos();
    });
  });

  // 课程表
  $("#addPeriod").addEventListener("click", () => {
    const last = periods[periods.length - 1] || { end: "20:35" };
    periods.push({ start: last.end, end: last.end });
    savePeriods(); renderPeriodEditor(); renderSchedule();
  });
  $("#courseSave").addEventListener("click", saveCourse);
  $("#courseClear").addEventListener("click", clearCourse);
  $("#courseCancel").addEventListener("click", closeCourseModal);
  $("#courseModal").addEventListener("click", (e) => { if (e.target === $("#courseModal")) closeCourseModal(); });

  // 学期
  $("#semStart").addEventListener("change", (e) => {
    const cfg = store.get("wb_semester", {});
    cfg.start = e.target.value; store.set("wb_semester", cfg); renderSemester();
  });
  $("#semEnd").addEventListener("change", (e) => {
    const cfg = store.get("wb_semester", {});
    cfg.end = e.target.value; store.set("wb_semester", cfg); renderSemester();
  });

  // 通知权限（首次点击时请求）
  document.addEventListener("click", () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, { once: true });

  // 渲染
  renderTodos();
  renderPeriodEditor();
  renderSchedule();
  renderCountdowns();
  checkDue();
  setInterval(() => { renderCountdowns(); checkDue(); }, 60000);

  // PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
