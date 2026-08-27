import { MATERIALS, MACHINE_TYPES, RECIPES, RECIPE_BY_ID, TEMPERATURES, PROJECTS, UPGRADES } from './data.js';
import { createState, advance, candidates, planBatch, configureMachine, startBatch, toggleAuto, capacity, energyCapacity, powerRate, sourceRates, visibleMaterials, availableRecipes, upgradeCost, afford, buyUpgrade, projectReady, completeProject, vent, serialize, restore } from './simulation.js';
import { mountCatalog, refreshCatalog } from './catalog-ui.js';
import { LESSONS, getGuide, performGuideAction, blockerAdvice, loadRecipe } from './guidance.js';

const SAVE_KEY = 'furnace.boundary-station.v0.3';

const practice = new URLSearchParams(location.search).get('practice') === '1';
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = n => n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const rateNumber = n => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const percent = (n, d) => `${Math.max(0, Math.min(100, n / d * 100))}%`;
const costText = cost => Object.entries(cost).map(([id, n]) => `${MATERIALS[id].name} ${n}`).join(' · ');
let state = createState();
let structure = '', recipeSignature = '', logSignature = '', toastTimer;
let activeTab = 'production';
let storageAvailable = true;
let lastFrame = performance.now();
let lastSave = 0;
let guideSignature = '', highlightedTarget = null, lastGuideId = '';
const tuningOpen = new Map();
const recipeTargets = new Map();

function notice(text) {
  $('offline-notice').hidden = false;
  $('offline-notice').innerHTML = `<span>${escape(text)}</span><button class="text-button" id="dismiss-notice">知道了 ×</button>`;
  $('dismiss-notice').onclick = () => { $('offline-notice').hidden = true; };
}
function showOffline(result) {
  if (result.offline < 5) return;
  const products = Object.entries(result.gains).map(([id, n]) => `${MATERIALS[id].name} +${number(n)}`).join('、');
  notice(`离线结算 ${clock(result.offline)}（最多 30 分钟）：${products || '未完成新的生产批次；采集、电力与冷却已按实际状态结算。'}`);
}
try {
  const raw = practice ? null : localStorage.getItem(SAVE_KEY);
  if (raw) {
    try { const result = restore(raw); state = result.state; showOffline(result); }
    catch (error) {
      // 留存损坏原文，避免自动存档覆盖唯一副本。
      localStorage.setItem(`${SAVE_KEY}.recovery`, raw);
      notice(`原存档无法读取，已保留恢复副本，本次从新站点开始：${error.message}`);
    }
  }
} catch { storageAvailable = false; notice('浏览器未允许本机存储。游戏仍可运行，请用“导出”手动保存。'); }
if (practice) notice('入门练习场：不会读取或覆盖正式存档，刷新后重新开始。完成后可关闭本页，回到原站点。');

function save() {
  lastSave = performance.now();
  if (practice) { $('save-status').textContent = '练习场 · 不自动保存'; return; }
  if (!storageAvailable) { $('save-status').textContent = '临时会话 · 请导出'; return; }
  try { localStorage.setItem(SAVE_KEY, serialize(state)); $('save-status').textContent = '已保存至本机'; }
  catch { storageAvailable = false; $('save-status').textContent = '保存失败 · 请导出'; notice('本机存储不可用或已满，请导出存档避免丢失进度。'); }
  lastSave = performance.now();
}
function toast(text, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = text; $('toast').className = `toast${error ? ' error' : ''}`; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function act(action) {
  const result = action();
  if (result?.ok === false) toast(result.reason, true);
  render(); save();
  return result;
}

function renderInventory() {
  const names = { raw: '原始矿藏', product: '工业材料', byproduct: '循环资源', void: '虚境材料' };
  const visible = visibleMaterials(state);
  $('inventory-list').innerHTML = Object.entries(names).map(([group, name]) => {
    const ids = visible.filter(id => MATERIALS[id].group === group);
    if (!ids.length) return '';
    return `<div class="material-group-title">${name}<span>${String(ids.length).padStart(2, '0')}</span></div>` + ids.map(id => {
      const m = MATERIALS[id];
      return `<div class="material-row" title="${m.tags.join(' · ')}"><span class="material-symbol" style="color:${m.color}">${m.symbol}</span><div class="material-info"><strong>${m.name}</strong><small id="rate-${id}"></small></div><div class="material-amount" id="amount-wrap-${id}"><b id="amount-${id}">0</b><small id="cap-${id}"></small></div></div>`;
    }).join('');
  }).join('');
}

function renderMachines() {
  document.querySelectorAll('.machine-tuning').forEach(el => tuningOpen.set(el.closest('[data-machine]').dataset.machine, el.open));
  const materials = visibleMaterials(state);
  const html = state.machines.map((m, index) => {
    const type = MACHINE_TYPES[m.type];
    const feedOptions = (selected, feeds) => `<option value="">空置进料</option>${[...new Set([...materials, ...feeds])].map(id => `<option value="${id}" ${selected === id ? 'selected' : ''}>${MATERIALS[id].name}</option>`).join('')}`;
    const known = availableRecipes(state).filter(r => r.type === m.type && state.discovered[r.id]);
    return `<article class="machine-card" id="machine-${m.id}" data-machine="${m.id}"><div class="machine-top"><div class="machine-title"><span class="machine-emblem" style="color:${type.color}">${type.mark}</span><div><h3>${type.name} ${m.type === 'basic' ? (index === 0 ? 'α' : 'β') : ''}</h3><small>${m.id.toUpperCase()}</small></div></div><span class="machine-number">0${index + 1}</span></div><div class="machine-status" id="status-${m.id}"></div><details class="machine-tuning" ${tuningOpen.get(m.id) ?? (!state.guide.enabled || state.projects.includes('automation')) ? 'open' : ''}><summary>调整进料与参数<span>${m.feeds.map(id => MATERIALS[id].name).join('＋')} · ${TEMPERATURES[m.temp]}</span></summary><div class="feed-caption"><span>进料通道 / 选择最多四种材料</span>${m.type === 'basic' ? `<button class="text-button" data-mixed="${m.id}">铁铜共炼 ↗</button>` : ''}</div><div class="feed-grid">${[0, 1, 2, 3].map(i => `<label class="feed-label"><span>0${i + 1}</span><select id="feed-${m.id}-${i}" data-feed="${i}" aria-label="${type.name}${index + 1} 进料${i + 1}">${feedOptions(m.feeds[i], m.feeds)}</select></label>`).join('')}</div><div class="machine-params"><label>反应温区<select id="temp-${m.id}" data-param="temp" aria-label="${type.name}${index + 1} 温度">${Object.entries(TEMPERATURES).map(([id, name]) => `<option value="${id}" ${id === m.temp ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>运行策略<select id="mode-${m.id}" data-param="mode" aria-label="${type.name}${index + 1} 运行策略"><option value="balanced" ${m.mode === 'balanced' ? 'selected' : ''}>均衡 / 标准能耗</option><option value="boost" ${m.mode === 'boost' ? 'selected' : ''}>超频 / 更快更热</option></select></label></div><select class="focus-select" id="focus-${m.id}" data-param="focus" aria-label="${type.name}${index + 1} 产出策略"><option value="">混合 / 轮换有效反应</option>${known.map(r => `<option value="${r.id}" ${m.focus === r.id ? 'selected' : ''}>锁定：${r.name}</option>`).join('')}</select></details><div class="candidate-box" id="candidates-${m.id}"></div><p class="batch-inputs" id="batch-inputs-${m.id}"></p><div class="batch-meta"><span id="batch-cost-${m.id}"></span><span id="batch-time-${m.id}"></span></div><div class="batch-track"><span id="batch-progress-${m.id}"></span></div><div class="last-output" id="last-output-${m.id}"></div><p class="machine-advice" id="advice-${m.id}" hidden></p><div class="machine-actions"><button class="primary" data-start="${m.id}">实验一批</button><button class="auto-button" data-auto="${m.id}"></button></div></article>`;
  }).join('');
  const locked = [];
  if (!state.projects.includes('workshop')) locked.push('<article class="machine-card locked-machine"><span>R</span><div><h3>循环工坊 · 待重建</h3><p>完成第二项工程，接通回收与装配路线。</p></div></article>');
  if (!state.projects.includes('rift')) locked.push('<article class="machine-card locked-machine"><span>Ψ</span><div><h3>虚境调和釜 · 待唤醒</h3><p>完成裂隙观测，接触现实之外的材料。</p></div></article>');
  $('machine-grid').innerHTML = html + locked.join('');
}

function renderProjects() {
  const current = PROJECTS.find(p => !state.projects.includes(p.id));
  $('chapter-steps').innerHTML = ['点火', '循环', '虚境', '锚定'].map((name, i) => `<span class="chapter-step ${i < state.projects.length ? 'done' : i === state.projects.length ? 'current' : ''}"><b>${i < state.projects.length ? '✓' : i + 1}</b>${name}</span>`).join('');
  $('current-guidance').textContent = current?.guidance || '第一枚现实锚点已经点亮。边界暂时稳定，这座工厂将继续生长。';
  if (!current) {
    $('project-content').innerHTML = '<div class="project-kicker">第一章 / 已完成</div><h3 class="project-title won-title">一个稳定的坐标。</h3><p class="project-reward">第一枚现实锚点已接入世界边界。你建立了一条从矿石、回收材料到虚境的完整工业链。</p><div class="won-stats" id="won-stats"></div><button class="secondary full" data-open-notebook>继续完善实验笔记 ↗</button><p class="project-foot">没有强制重置。继续优化你的工厂。</p>';
    return;
  }
  const rows = Object.entries(current.cost).map(([id, amount]) => `<div class="requirement" data-requirement="${id}" data-needed="${amount}"><div><span>${MATERIALS[id].name}</span><span class="numbers"></span></div><div class="track"><span></span></div></div>`).join('');
  const discoveries = current.discoveries ? `<div class="requirement" data-requirement="discoveries" data-needed="${current.discoveries}"><div><span>发现不同反应</span><span class="numbers"></span></div><div class="track"><span></span></div></div>` : '';
  $('project-content').innerHTML = `<div class="project-kicker">${current.subtitle}</div><h3 class="project-title">${current.name}</h3><p class="project-reward">${current.reward}</p><div class="requirements">${rows}${discoveries}</div><button class="primary full" id="project-submit" data-project="${current.id}">提交材料 · 完成工程</button><p class="project-foot">提交时消耗以上库存，进度永久保留</p>`;
}

function renderUpgrades() {
  $('upgrade-list').innerHTML = Object.entries(UPGRADES).map(([id, u]) => {
    const locked = u.stage && !state.projects.includes(u.stage);
    const maxed = state.upgrades[id] >= u.max;
    return `<div class="upgrade"><div class="upgrade-top"><strong>${u.name}</strong><span>${state.upgrades[id]} / ${u.max}</span></div><p>${u.effect}</p><div class="upgrade-bottom"><span class="upgrade-cost">${maxed ? '设施已完成' : costText(upgradeCost(state, id))}</span><button class="secondary" data-upgrade="${id}">${maxed ? '已满级' : locked ? '待解锁' : '升级 ↗'}</button></div></div>`;
  }).join('');
}

function renderNotebook() {
  document.querySelectorAll('[data-recipe-target]').forEach(el => recipeTargets.set(el.dataset.recipeTarget, el.value));
  $('recipe-list').innerHTML = availableRecipes(state).map(r => {
    const count = state.discovered[r.id] || 0;
    const inputs = r.roles.map(role => `${role.id ? MATERIALS[role.id].name : `[${role.tag}]`} ×${role.amount}`).join(' ＋ ');
    const secondary = Object.entries(r.byproducts).map(([id, n]) => `${MATERIALS[id].name} ×${n}`).join(' ＋ ');
    return `<article class="recipe-card ${count ? 'known' : ''}" data-recipe="${r.id}"><div class="recipe-heading"><h3>${count ? `✓ ${r.name}` : `? 未识别 · ${r.family}`}</h3><small data-recipe-count="${r.id}">${count ? `${count >= 6 ? '精确' : count >= 3 ? '标准' : '粗略'} · ${count} 批` : '待实验'}</small></div>${count ? `<div class="recipe-formula">${inputs}<br>↳ ${MATERIALS[r.output].name} ×${r.amount}${r.bonus ? `（随机额外 +${r.bonus}）` : ''}${secondary ? `<br>＋ ${secondary}` : ''}</div>` : `<p>${r.hint}</p>`}<div class="recipe-foot"><span>${MACHINE_TYPES[r.type].name} · ${TEMPERATURES[r.temp]}${count ? ` · ${r.seconds}s / 批` : ''}</span>${count ? `<div class="recipe-loader"><select data-recipe-target="${r.id}" aria-label="装载${r.name}的目标设备">${state.machines.filter(m => m.type === r.type).map(m => `<option value="${m.id}" ${recipeTargets.get(r.id) === m.id ? 'selected' : ''}>${m.id === 'furnace-1' ? '熔炼釜 α' : m.id === 'furnace-2' ? '熔炼釜 β' : MACHINE_TYPES[m.type].name}</option>`).join('')}</select><button class="secondary" data-load="${r.id}">装载到所选设备 ↗</button></div>` : '<span>产出后记录</span>'}</div></article>`;
  }).join('');
}

function refreshMachine(machine) {
  const card = $(`machine-${machine.id}`);
  const plan = machine.batch || planBatch(state, machine);
  const matching = candidates(state, machine);
  const visibleCandidates = machine.focus ? matching.filter(c => c.recipe.id === machine.focus) : matching;
  card.classList.toggle('busy', !!machine.batch);
  card.classList.toggle('warning', !machine.batch && machine.running && !plan.ok);
  const status = $(`status-${machine.id}`);
  status.textContent = state.paused ? '全站暂停 · 批次进度保留' : machine.batch ? `${machine.batch.entries.length === 2 ? '● 双路并行' : '● 反应进行中'}${machine.running ? ' · 连续生产' : ' · 完成本批后停止'}` : (machine.running ? plan.reason || '等待调度' : plan.ok ? '就绪 · 可开始实验' : plan.reason);
  status.className = `machine-status ${machine.batch ? 'active' : machine.running && !plan.ok ? 'warn' : ''}`;
  $(`candidates-${machine.id}`).innerHTML = `<span>有效反应 ${visibleCandidates.length} · ${state.upgrades.parallel && !machine.focus ? '最多双路' : '单路轮换'}</span>${visibleCandidates.length ? visibleCandidates.map(c => `<div class="candidate-line ${state.discovered[c.recipe.id] ? '' : 'unknown'}"><span>${state.discovered[c.recipe.id] ? c.recipe.name : `? ${c.recipe.family}`}</span><span>${c.recipe.bonus ? `额外收率 ${Math.round(c.chance * 100)}%` : '稳定产出'}</span></div>`).join('') : '<p class="empty-candidate">改变进料或温区，寻找新的反应。</p>'}`;
  $(`batch-inputs-${machine.id}`).textContent = plan.ok ? `本批投入：${costText(plan.costs)}` : "不满足条件时不扣除资源";
  $(`last-output-${machine.id}`).textContent = Object.keys(machine.lastOutputs || {}).length ? `上批产出：${costText(machine.lastOutputs)}` : "完成实验后在此记录实际产物";
  const advice = $(`advice-${machine.id}`);
  advice.textContent = machine.batch ? '' : blockerAdvice(state, machine, plan);
  advice.hidden = !advice.textContent;
  $(`batch-cost-${machine.id}`).textContent = plan.ok ? `${number(plan.energy)} EU · +${number(plan.heat)} HU` : '等待有效批次';
  $(`batch-time-${machine.id}`).textContent = machine.batch ? `${number(machine.batch.remaining)}s / ${number(machine.batch.duration)}s` : plan.ok ? `${number(plan.duration)}s / 批` : '';
  $(`batch-progress-${machine.id}`).style.width = machine.batch ? percent(machine.batch.duration - machine.batch.remaining, machine.batch.duration) : '0%';
  card.querySelectorAll('select, [data-mixed]').forEach(el => { el.disabled = !!machine.batch; });
  const start = card.querySelector('[data-start]'); start.disabled = !!machine.batch || !plan.ok || state.paused;
  start.textContent = machine.batch ? '反应进行中' : '实验一批'; start.title = plan.reason || '消耗显示的原料与电力，开始一个批次';
  const auto = card.querySelector('[data-auto]'); auto.disabled = !state.projects.includes('automation'); auto.classList.toggle('on', machine.running);
  auto.textContent = !state.projects.includes('automation') ? '连续生产 · 待解锁' : machine.running ? '■ 停止连续' : '↻ 连续生产';
}

function render() {
  const focusId = document.activeElement?.id;
  const nextStructure = JSON.stringify([visibleMaterials(state), state.projects, state.upgrades, Object.keys(state.discovered), state.machines.map(m => [m.id, m.feeds, m.temp, m.mode, m.focus])]);
  if (structure !== nextStructure) {
    structure = nextStructure; renderInventory(); renderMachines(); renderProjects(); renderUpgrades();
    if (focusId) $(focusId)?.focus({ preventScroll: true });
  }
  $('energy-value').textContent = number(state.energy); $('energy-max').textContent = `/ ${energyCapacity(state)}`;
  $('energy-bar').style.width = percent(state.energy, energyCapacity(state)); $('power-rate').textContent = `供电 +${number(powerRate(state))}/s · 批次预付能量`;
  $('heat-value').textContent = number(state.heat); $('heat-bar').style.width = percent(state.heat, 90);
  $('heat-status').textContent = state.overheated ? '热保护' : state.heat >= 70 ? '负荷偏高' : '稳定';
  $('active-value').textContent = state.paused ? '0' : state.machines.filter(m => m.batch).length; $('machine-max').textContent = `/ ${state.machines.length}`;
  $('cycles-value').textContent = `完成 ${state.stats.cycles} 批 · 混炼 ${state.stats.parallelCycles} 批`;
  $('discovery-value').textContent = Object.keys(state.discovered).length; $('notebook-count').textContent = Object.keys(state.discovered).length;
  $('time-value').textContent = `${state.paused ? '模拟已暂停' : '驻站'} ${clock(state.elapsed)}`;
  $('pause-button').textContent = state.paused ? '继续模拟' : '暂停模拟'; $('pause-button').classList.toggle('paused-indicator', state.paused);
  const rates = sourceRates(state);
  for (const id of visibleMaterials(state)) {
    $(`amount-${id}`).textContent = number(state.inventory[id]); $(`cap-${id}`).textContent = `/ ${capacity(state, id)}`;
    $(`amount-wrap-${id}`).classList.toggle('full-storage', state.inventory[id] >= capacity(state, id) - 1);
    $(`rate-${id}`).textContent = rates[id] ? (state.paused ? '采集已暂停' : `采集 +${rateNumber(rates[id])}/s`) : MATERIALS[id].tags.join(' · ');
  }
  $('extraction-level').textContent = `${number(1 + state.upgrades.extraction * .5)}× 基础速率`;
  $('extraction-status').textContent = state.paused ? '采集臂已暂停' : '采集臂持续运转';
  $('cooling-level').textContent = state.upgrades.cooling ? `Lv.${state.upgrades.cooling}` : '未安装';
  $('cooling-toggle').checked = state.cooling; $('cooling-toggle').disabled = !state.upgrades.cooling;
  $('vent-button').disabled = state.inventory.carbon_dioxide < .01;
  state.machines.forEach(refreshMachine);
  document.querySelectorAll('[data-requirement]').forEach(el => {
    const id = el.dataset.requirement, target = Number(el.dataset.needed);
    const current = id === 'discoveries' ? Object.keys(state.discovered).length : state.inventory[id];
    el.querySelector('.numbers').textContent = `${number(current)} / ${target}`;
    el.querySelector('.track span').style.width = percent(current, target);
  });
  const submit = $('project-submit'); if (submit) submit.disabled = !projectReady(state, submit.dataset.project);
  document.querySelectorAll('[data-upgrade]').forEach(button => {
    const id = button.dataset.upgrade, u = UPGRADES[id];
    button.disabled = state.upgrades[id] >= u.max || (u.stage && !state.projects.includes(u.stage)) || !afford(state, upgradeCost(state, id));
  });
  if ($('won-stats')) $('won-stats').textContent = `驻站 ${clock(state.elapsed)} · 发现 ${Object.keys(state.discovered).length}/${RECIPES.length} 条反应 · 累计 ${state.stats.cycles} 批生产。`;
  const nextRecipes = JSON.stringify([Object.keys(state.discovered), state.projects, state.machines.map(m => m.id)]);
  if (nextRecipes !== recipeSignature) { recipeSignature = nextRecipes; renderNotebook(); }
  document.querySelectorAll('[data-recipe-count]').forEach(el => {
    const count = state.discovered[el.dataset.recipeCount] || 0;
    el.textContent = count ? `${count >= 6 ? '精确' : count >= 3 ? '标准' : '粗略'} · ${count} 批` : '待实验';
  });
  renderGuide();
  if (activeTab === 'catalog') refreshCatalog(state);
  const nextLogs = JSON.stringify(state.logs);
  if (nextLogs !== logSignature) {
    logSignature = nextLogs;
    $('log-list').innerHTML = state.logs.map(entry => `<li class="${escape(entry.kind)}"><time>${clock(entry.time)}</time><span>${escape(entry.text)}</span></li>`).join('');
  }
}

function highlight(target) {
  const element = target ? document.querySelector(target) : null;
  if (element === highlightedTarget) return;
  highlightedTarget?.classList.remove('guide-target');
  highlightedTarget = element;
  highlightedTarget?.classList.add('guide-target');
}

function renderGuide() {
  const guide = getGuide(state), enabled = state.guide.enabled;
  if (guide.id === 'graduated' && lastGuideId !== 'graduated') state.guide.tab = 'project';
  lastGuideId = guide.id;
  $('task-panel').hidden = !enabled;
  $('task-launcher').hidden = enabled;
  $('task-panel').classList.toggle('minimized', state.guide.collapsed);
  $('task-panel').dataset.dock = state.guide.dock;
  $('task-body').hidden = state.guide.collapsed;
  $('task-toggle').textContent = enabled ? '任务 · 已打开' : '任务';
  $('task-toggle').setAttribute('aria-expanded', String(enabled));
  $('task-minimize').textContent = state.guide.collapsed ? '+' : '−';
  $('task-minimize').setAttribute('aria-label', state.guide.collapsed ? '展开任务栏' : '最小化任务栏');
  $('task-minimize').setAttribute('aria-expanded', String(!state.guide.collapsed));
  $('task-dock').setAttribute('aria-label', state.guide.dock === 'right' ? '将任务栏移到左侧' : '将任务栏移到右侧');
  $('task-summary').textContent = state.guide.tab === 'guide' ? `${Math.min(guide.index + 1, LESSONS.length)}/${LESSONS.length}` : `${state.projects.length}/${PROJECTS.length}`;
  $('task-guide-count').textContent = `${guide.completed.filter(Boolean).length}/${LESSONS.length}`;
  $('task-project-count').textContent = `${state.projects.length}/${PROJECTS.length}`;
  ['guide', 'project'].forEach(id => { $(`task-view-${id}`).hidden = state.guide.tab !== id; });
  document.querySelectorAll('[data-task-tab]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.taskTab === state.guide.tab)));
  $('guide-kicker').textContent = `调和师入门 / ${guide.index === LESSONS.length ? '已完成' : `${String(guide.index + 1).padStart(2, '0')} · ${LESSONS.length}`}`;
  if (!enabled) { highlight(null); return; }
  if ($('guide-title').textContent !== guide.title) $('guide-title').textContent = guide.title;
  $('guide-text').textContent = guide.text;
  $('guide-why').textContent = guide.why;
  $('guide-next').textContent = guide.action.text;
  $('guide-action').textContent = guide.action.label;
  $('guide-action').disabled = guide.action.kind === 'wait';
  $('guide-action').setAttribute('aria-describedby', 'guide-next');
  $('guide-locate').textContent = guide.action.kind === 'wait' ? '查看等待中的设备 ↗' : '定位实际操作 ↗';
  const signature = JSON.stringify([guide.id, guide.completed, guide.requirements]);
  if (signature !== guideSignature) {
    guideSignature = signature;
    $('guide-steps').innerHTML = LESSONS.map((lesson, i) => `<li class="${guide.completed[i] ? 'done' : i === guide.index ? 'current' : ''}" ${i === guide.index ? 'aria-current="step"' : ''}><span>${guide.completed[i] ? '✓' : i + 1}</span>${lesson.name}</li>`).join('');
    $('guide-requirements').innerHTML = Object.entries(guide.requirements).map(([id, amount]) => `<div class="guide-resource" data-guide-resource="${id}"><span>${MATERIALS[id].name}</span><b></b><div class="track"><span></span></div></div>`).join('');
  }
  document.querySelectorAll('[data-guide-resource]').forEach(el => {
    const id = el.dataset.guideResource, target = guide.requirements[id];
    el.querySelector('b').textContent = `${number(state.inventory[id])} / ${target}`;
    el.querySelector('.track span').style.width = percent(state.inventory[id], target);
  });
  highlight(state.guide.tab === 'guide' && !state.guide.collapsed ? guide.action.target : null);
}

function locate(target, openTuning = false) {
  const inTasks = document.querySelector(target)?.closest('#task-panel');
  if (inTasks) {
    state.guide.enabled = true; state.guide.collapsed = false; state.guide.tab = 'project';
  } else state.guide.collapsed = true;
  renderGuide(); save();
  if (target.includes('recipe') || target === '#notebook-view') setTab('notebook');
  else if (target.includes('machine') || target.includes('data-start') || target.includes('data-auto')) setTab('production');
  const el = document.querySelector(target);
  if (!el) return;
  const details = el.closest('details') || (openTuning && el.querySelector('.machine-tuning'));
  if (details) details.open = true;
  if (!el.matches('button, select, input, a, summary')) el.tabIndex = -1;
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  el.focus({ preventScroll: true });
}

function setTab(tab) {
  activeTab = tab;
  if (tab === 'catalog') refreshCatalog(state);
  ['production', 'notebook', 'catalog', 'logs'].forEach(id => { $(`${id}-view`).hidden = tab !== id; });
  document.querySelectorAll('[data-tab]').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); button.setAttribute('aria-pressed', button.dataset.tab === tab); });
}

document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.tab) setTab(button.dataset.tab);
  if (button.dataset.close) $(button.dataset.close).close();
  if (button.hasAttribute('data-open-notebook')) setTab('notebook');
  if (button.dataset.start) act(() => startBatch(state, button.dataset.start));
  if (button.dataset.auto) act(() => toggleAuto(state, button.dataset.auto));
  if (button.dataset.project) {
    const id = button.dataset.project;
    const result = act(() => completeProject(state, id));
    if (result.ok) toast(id === 'anchor' ? '第一枚现实锚点已点亮。首章完成！' : '工程完成，新的生产能力已接通。');
  }
  if (button.dataset.upgrade) act(() => buyUpgrade(state, button.dataset.upgrade));
  if (button.dataset.mixed) {
    const result = act(() => configureMachine(state, button.dataset.mixed, { feeds: ['iron_ore', 'copper_ore', 'coal'], temp: 'high', focus: null }));
    if (result.ok) toast(state.upgrades.parallel ? '已装载铁铜共炼：两条有效反应可同批运行。' : '已装载铁铜路线；当前轮换运行，升级“双路混炼”后可同批生产。');
  }
  if (button.dataset.load) {
    const recipe = RECIPE_BY_ID[button.dataset.load];
    const id = button.closest('[data-recipe]').querySelector('[data-recipe-target]').value;
    const result = act(() => loadRecipe(state, recipe.id, id));
    if (result.ok) { locate(`[data-machine="${id}"]`, true); toast(`已装载「${recipe.name}」到 ${id}。只改配置，确认后再开工。`); }
  }
});

$('task-toggle').onclick = () => act(() => { state.guide.enabled = !state.guide.enabled; if (state.guide.enabled) state.guide.collapsed = false; });
$('task-launcher').onclick = () => { act(() => { state.guide.enabled = true; state.guide.collapsed = false; }); $('task-minimize').focus(); };
$('task-close').onclick = () => { act(() => { state.guide.enabled = false; }); $('task-toggle').focus(); };
$('task-minimize').onclick = () => act(() => { state.guide.collapsed = !state.guide.collapsed; });
$('task-dock').onclick = () => act(() => { state.guide.dock = state.guide.dock === 'right' ? 'left' : 'right'; });
document.querySelectorAll('[data-task-tab]').forEach(button => button.onclick = () => act(() => { state.guide.tab = button.dataset.taskTab; }));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.guide.enabled && !event.target.matches('input, select, textarea') && !document.querySelector('dialog[open]')) { act(() => { state.guide.enabled = false; }); $('task-toggle').focus(); }
});
$('guide-locate').onclick = () => locate(getGuide(state).action.target);
$('guide-action').onclick = () => {
  const action = getGuide(state).action;
  if (action.kind === 'locate') return locate(action.target);
  const result = act(() => performGuideAction(state, action));
  if (result.ok && action.kind === 'load') {
    locate(action.target, true);
    toast('组合已装载。核对进料与本批投入，再点击“实验一批”。');
  }
  if (result.ok && action.kind === 'project') toast('工程完成，新的生产能力已接通。');
};

$('machine-grid').addEventListener('change', event => {
  const select = event.target.closest('select'); if (!select) return;
  const card = select.closest('[data-machine]'), id = card.dataset.machine;
  const config = select.hasAttribute('data-feed') ? { feeds: [...card.querySelectorAll('[data-feed]')].map(el => el.value).filter(Boolean), focus: null }
    : { [select.dataset.param]: select.value || null };
  const result = act(() => configureMachine(state, id, config));
  if (!result.ok) { structure = ''; render(); }
});
$('pause-button').onclick = () => act(() => { state.paused = !state.paused; });
$('cooling-toggle').onchange = event => act(() => { state.cooling = event.target.checked; });
$('vent-button').onclick = () => act(() => { const amount = vent(state); toast(`已释放 ${number(amount)} 尾气；后续可用工坊回收碳源。`); });
$('help-button').onclick = () => $('help-dialog').showModal();
$('reset-button').onclick = () => $('reset-dialog').showModal();
$('confirm-reset').onclick = () => { state = createState(); structure = ''; lastFrame = performance.now(); $('reset-dialog').close(); $('offline-notice').hidden = true; setTab('production'); render(); save(); toast('新站点已就绪。'); };
$('export-button').onclick = () => {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `furnace-v0.3-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('存档已导出。');
};
$('import-button').onclick = () => $('import-dialog').showModal();
$('confirm-import').onclick = () => { $('import-dialog').close(); $('import-file').click(); };
$('import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 300000) throw new Error('文件过大');
    const result = restore(await file.text()); state = result.state; structure = ''; lastFrame = performance.now(); render(); save(); showOffline(result); toast('存档已恢复。');
  } catch (error) { toast(`导入失败，原进度保持不变：${error.message}`, true); }
  event.target.value = '';
};

mountCatalog($('catalog-view'), () => state, () => { state.guide.collapsed = true; renderGuide(); });
render(); save();
setInterval(() => {
  const now = performance.now();
  advance(state, (now - lastFrame) / 1000); lastFrame = now;
  render(); if (now - lastSave > 10000) save();
}, 250);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
