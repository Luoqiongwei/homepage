import { MATERIALS, SOURCES, RECIPES, RECIPE_BY_ID, PROJECTS, UPGRADES } from './data.js';

export const SAVE_VERSION = 1;
export const OFFLINE_LIMIT = 30 * 60;
export const STEP = .25;
const EPS = 1e-8;
const add = (target, key, value) => { target[key] = (target[key] || 0) + value; };
const copy = value => JSON.parse(JSON.stringify(value));

export function createMachine(id, type, feeds = [], temp = 'high') {
  return { id, type, feeds, temp, mode: 'balanced', focus: null, running: false, batch: null, cursor: 0, completed: 0, lastOutputs: {}, status: '等待实验' };
}

export function createState(seed = 481516) {
  const inventory = Object.fromEntries(Object.keys(MATERIALS).map(id => [id, 0]));
  Object.assign(inventory, { iron_ore: 24, copper_ore: 18, coal: 26, quartz_sand: 12, water: 18 });
  return {
    version: SAVE_VERSION, seed: seed >>> 0, elapsed: 0, remainder: 0, paused: false,
    inventory, produced: Object.fromEntries(Object.keys(MATERIALS).map(id => [id, 0])),
    energy: 70, heat: 12, overheated: false, cooling: true,
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map(id => [id, 0])), projects: [], discovered: {},
    machines: [createMachine('furnace-1', 'basic', ['iron_ore', 'coal']), createMachine('furnace-2', 'basic', ['copper_ore', 'coal'])],
    logs: [{ time: 0, text: '边界站重新接通了电源。先完成铁与铜的两次实验。', kind: 'info' }],
    stats: { cycles: 0, parallelCycles: 0, recovered: 0, vented: 0, autoCycles: 0 },
    guide: { enabled: true, tab: 'guide', collapsed: false, dock: 'right' },
  };
}

export function log(state, text, kind = 'info') {
  state.logs.unshift({ time: state.elapsed, text, kind });
  state.logs = state.logs.slice(0, 60);
}
export function capacity(state, id) { return (id === 'carbon_dioxide' ? 60 : 120) * (1 + state.upgrades.storage); }
export function energyCapacity(state) { return 100 + state.upgrades.power * 30; }
export function powerRate(state) { return 1.8 + state.upgrades.power * .9; }
export function sourceRates(state) {
  const rates = Object.fromEntries(Object.entries(SOURCES).map(([id, rate]) => [id, rate * (1 + .5 * state.upgrades.extraction)]));
  if (state.projects.includes('rift')) rates.void_dust = .10 * (1 + .25 * state.upgrades.extraction);
  return rates;
}
export function availableRecipes(state) { return RECIPES.filter(r => !r.stage || state.projects.includes(r.stage)); }
export function visibleMaterials(state) {
  return Object.keys(MATERIALS).filter(id => SOURCES[id] || state.inventory[id] > 0 || state.produced[id] > 0 || (id === 'void_dust' && state.projects.includes('rift')));
}
export function afford(state, costs) { return Object.entries(costs).every(([id, value]) => state.inventory[id] + EPS >= value); }
export function pay(state, costs) { for (const [id, value] of Object.entries(costs)) state.inventory[id] = Math.max(0, state.inventory[id] - value); }

// 特定物质定义元素来源，标签槽定义可替换的反应角色；不会凭空把铁变成铜。
export function bindInputs(recipe, feeds) {
  const inputs = {};
  let impure = false;
  for (const role of recipe.roles) {
    const chosen = role.id ? (feeds.includes(role.id) ? role.id : null)
      : feeds.filter(id => MATERIALS[id]?.tags.includes(role.tag)).sort((a, b) => Number(b === role.preferred) - Number(a === role.preferred))[0];
    if (!chosen) return null;
    add(inputs, chosen, role.amount);
    if (role.tag && chosen !== role.preferred) impure = true;
  }
  return { inputs, impure };
}

export function candidates(state, machine, ignoreTemperature = false) {
  return availableRecipes(state).flatMap(recipe => {
    if (recipe.type !== machine.type || (!ignoreTemperature && recipe.temp !== machine.temp)) return [];
    const bound = bindInputs(recipe, machine.feeds);
    if (!bound) return [];
    const count = state.discovered[recipe.id] || 0;
    const chance = recipe.bonus ? Math.min(.95, recipe.chance + Math.min(count, 6) * .04 - (bound.impure ? .12 : 0)) : 0;
    return [{ recipe, ...bound, chance }];
  });
}

export function configureMachine(state, id, config) {
  const machine = state.machines.find(m => m.id === id);
  if (!machine) return { ok: false, reason: '设备不存在' };
  if (machine.batch) return { ok: false, reason: '本批完成后再调整进料' };
  const feeds = config.feeds ?? machine.feeds;
  if (!Array.isArray(feeds) || feeds.length > 4 || new Set(feeds).size !== feeds.length || feeds.some(f => !Object.hasOwn(MATERIALS, f))) return { ok: false, reason: '请选择至多四种不同进料' };
  const temp = config.temp ?? machine.temp;
  const mode = config.mode ?? machine.mode;
  if (!['low', 'medium', 'high', 'extreme'].includes(temp) || !['balanced', 'boost'].includes(mode)) return { ok: false, reason: '参数无效' };
  const focus = config.focus === undefined ? machine.focus : config.focus;
  if (focus !== null && (!RECIPE_BY_ID[focus] || !state.discovered[focus])) return { ok: false, reason: '只能锁定已发现的反应' };
  Object.assign(machine, { feeds: [...feeds], temp, mode, focus });
  machine.status = '配置已更新';
  return { ok: true };
}

function outputMaximum(candidate) {
  const outputs = { ...candidate.recipe.byproducts };
  add(outputs, candidate.recipe.output, candidate.recipe.amount + candidate.recipe.bonus);
  return outputs;
}

export function reservedOutputs(state) {
  const reserved = {};
  for (const machine of state.machines) for (const entry of machine.batch?.entries || []) {
    for (const [id, amount] of Object.entries(entry.maxOutputs)) add(reserved, id, amount);
  }
  return reserved;
}

// 预先扣除全部进料和能量、预留最坏情况下的产物空间，避免跨设备透支。
export function planBatch(state, machine) {
  if (machine.batch) return { ok: false, code: 'busy', reason: '正在处理本批' };
  if (state.paused) return { ok: false, code: 'paused', reason: '全站已暂停' };
  if (state.overheated || state.heat >= 90) return { ok: false, code: 'heat', reason: '热保护：降至 65 以下后恢复' };
  let pool = candidates(state, machine);
  const allCandidates = pool;
  if (machine.focus) pool = pool.filter(c => c.recipe.id === machine.focus);
  if (!pool.length) {
    if (machine.focus && allCandidates.length) return { ok: false, code: 'focus', reason: '锁定的反应与当前进料不一致' };
    const sameInputs = candidates(state, machine, true);
    return { ok: false, code: sameInputs.length ? 'temperature' : 'inputs', reason: sameInputs.length ? '温区不合适：参照实验笔记调整' : '没有有效反应：尝试调整进料' };
  }
  const start = machine.cursor % pool.length;
  pool = [...pool.slice(start), ...pool.slice(0, start)];
  const maxLanes = state.upgrades.parallel && !machine.focus ? 2 : 1;
  const selected = [];
  const costs = {};
  const reserved = reservedOutputs(state);
  let energy = 0, heat = 0, seconds = 0;
  let reason = '等待原料补充';
  let blocker = { code: 'materials', missing: {} };
  for (const candidate of pool) {
    const nextCosts = { ...costs };
    for (const [id, amount] of Object.entries(candidate.inputs)) add(nextCosts, id, amount);
    if (!afford(state, nextCosts)) {
      const missing = Object.fromEntries(Object.entries(nextCosts).filter(([id, n]) => state.inventory[id] + EPS < n).map(([id, n]) => [id, n - state.inventory[id]]));
      reason = `缺少原料：${Object.keys(missing).map(id => MATERIALS[id].name).join('、')}`;
      blocker = { code: 'materials', missing }; continue;
    }
    const nextSelected = [...selected, candidate];
    const outputs = {};
    for (const c of nextSelected) for (const [id, amount] of Object.entries(outputMaximum(c))) add(outputs, id, amount);
    const full = Object.keys(outputs).find(id => state.inventory[id] - (nextCosts[id] || 0) + (reserved[id] || 0) + outputs[id] > capacity(state, id) + EPS);
    if (full) { reason = `${MATERIALS[full].name}缓冲仓已满：回收、使用或扩容`; blocker = { code: 'capacity', resource: full }; continue; }
    const factor = machine.mode === 'boost' ? 1.5 : 1;
    const nextEnergy = nextSelected.reduce((n, c) => n + c.recipe.energy * (c.impure ? 1.12 : 1), 0) * factor * (nextSelected.length > 1 ? .82 : 1);
    if (state.energy + EPS < nextEnergy) { reason = '电池不足：等待供电或升级光能阵列'; blocker = { code: 'energy', required: nextEnergy }; continue; }
    Object.assign(costs, nextCosts);
    selected.push(candidate);
    energy = nextEnergy;
    heat = nextSelected.reduce((n, c) => n + c.recipe.heat * (c.impure ? 1.15 : 1), 0) * (machine.mode === 'boost' ? 1.4 : 1);
    seconds = Math.max(...nextSelected.map(c => c.recipe.seconds)) * (machine.mode === 'boost' ? .65 : 1);
    if (selected.length === maxLanes) break;
  }
  if (!selected.length) return { ok: false, reason, ...blocker };
  return { ok: true, costs, energy, heat, duration: seconds, remaining: seconds,
    entries: selected.map(c => ({ recipeId: c.recipe.id, chance: c.chance, maxOutputs: outputMaximum(c) })) };
}

export function startBatch(state, id, automatic = false) {
  const machine = state.machines.find(m => m.id === id);
  if (!machine) return { ok: false, reason: '设备不存在' };
  const plan = planBatch(state, machine);
  if (!plan.ok) { machine.status = plan.reason; return plan; }
  pay(state, plan.costs);
  state.energy = Math.max(0, state.energy - plan.energy);
  machine.batch = plan;
  machine.batch.automatic = automatic;
  machine.cursor++;
  machine.status = plan.entries.length > 1 ? '双路并行运行' : '单路反应中';
  return { ok: true };
}

export function toggleAuto(state, id) {
  const machine = state.machines.find(m => m.id === id);
  if (!machine || !state.projects.includes('automation')) return { ok: false, reason: '先重启控制总线' };
  machine.running = !machine.running;
  return { ok: true };
}

function random(state) {
  state.seed = (Math.imul(1664525, state.seed) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
function complete(state, machine) {
  const batch = machine.batch;
  const results = {};
  for (const entry of batch.entries) {
    const recipe = RECIPE_BY_ID[entry.recipeId];
    const amount = recipe.amount + (random(state) < entry.chance ? recipe.bonus : 0);
    add(results, recipe.output, amount);
    for (const [id, quantity] of Object.entries(recipe.byproducts)) add(results, id, quantity);
    if (!state.discovered[recipe.id]) log(state, `发现「${recipe.name}」：已记录配方，可一键装载。`, 'discovery');
    state.discovered[recipe.id] = (state.discovered[recipe.id] || 0) + 1;
    if (recipe.id === 'recycle') state.stats.recovered += batch.costs.slag;
    if (recipe.id === 'capture') state.stats.recovered += batch.costs.carbon_dioxide;
  }
  for (const [id, amount] of Object.entries(results)) {
    state.inventory[id] += amount;
    state.produced[id] += amount;
  }
  state.heat = Math.min(120, state.heat + batch.heat);
  if (state.heat >= 90) state.overheated = true;
  state.stats.cycles++;
  if (batch.automatic) state.stats.autoCycles = (state.stats.autoCycles || 0) + 1;
  if (batch.entries.length > 1) state.stats.parallelCycles++;
  machine.completed++;
  machine.lastOutputs = results;
  machine.status = '本批完成';
  machine.batch = null;
}

function tick(state) {
  state.elapsed += STEP;
  const reserve = reservedOutputs(state);
  for (const [id, rate] of Object.entries(sourceRates(state))) {
    const room = Math.max(0, capacity(state, id) - (reserve[id] || 0) - state.inventory[id]);
    state.inventory[id] += Math.min(room, rate * STEP);
  }
  state.energy = Math.min(energyCapacity(state), state.energy + powerRate(state) * STEP);
  let cooling = .7;
  const waterUse = state.upgrades.cooling * .12 * STEP;
  if (state.cooling && state.heat > 10 && state.upgrades.cooling && state.inventory.water + EPS >= waterUse) {
    state.inventory.water = Math.max(0, state.inventory.water - waterUse);
    cooling += state.upgrades.cooling * .9;
  }
  state.heat = Math.max(0, state.heat - cooling * STEP);
  if (state.overheated && state.heat < 65) state.overheated = false;
  for (const machine of state.machines) {
    if (machine.batch) {
      machine.batch.remaining = Math.max(0, machine.batch.remaining - STEP);
      if (machine.batch.remaining < EPS) complete(state, machine);
    }
  }
  // 轮换调度顺序，避免电量不足时固定第一台永远抢占电池。
  const offset = Math.floor(state.elapsed) % state.machines.length;
  const machines = [...state.machines.slice(offset), ...state.machines.slice(0, offset)];
  for (const machine of machines) if (machine.running && !machine.batch) startBatch(state, machine.id, true);
}

export function advance(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || state.paused) return;
  state.remainder += Math.min(seconds, OFFLINE_LIMIT);
  const count = Math.floor((state.remainder + EPS) / STEP);
  state.remainder = Math.max(0, state.remainder - count * STEP);
  for (let i = 0; i < count; i++) tick(state);
}

export function upgradeCost(state, id) {
  return Object.fromEntries(Object.entries(UPGRADES[id].cost).map(([material, amount]) => [material, amount * (state.upgrades[id] + 1)]));
}
export function buyUpgrade(state, id) {
  const upgrade = UPGRADES[id];
  if (!upgrade || state.upgrades[id] >= upgrade.max || (upgrade.stage && !state.projects.includes(upgrade.stage))) return { ok: false, reason: '升级尚未开放或已满级' };
  const cost = upgradeCost(state, id);
  if (!afford(state, cost)) return { ok: false, reason: '升级材料不足' };
  pay(state, cost); state.upgrades[id]++;
  log(state, `${upgrade.name}升至 ${state.upgrades[id]} 级。`, 'success');
  return { ok: true };
}

export function projectReady(state, id) {
  const project = PROJECTS.find(p => p.id === id);
  return !!project && !state.projects.includes(id) && (!project.requires || state.projects.includes(project.requires))
    && Object.keys(state.discovered).length >= (project.discoveries || 0) && afford(state, project.cost);
}
export function completeProject(state, id) {
  if (!projectReady(state, id)) return { ok: false, reason: '项目条件尚未满足' };
  const project = PROJECTS.find(p => p.id === id);
  pay(state, project.cost); state.projects.push(id);
  if (id === 'workshop') state.machines.push(createMachine('workshop-1', 'processor', ['slag', 'water'], 'low'));
  if (id === 'rift') state.machines.push(createMachine('void-1', 'void', ['void_dust', 'glass'], 'medium'));
  log(state, `完成「${project.name}」。${project.reward}`, 'project');
  return { ok: true };
}
export function vent(state) {
  const amount = Math.min(15, state.inventory.carbon_dioxide);
  state.inventory.carbon_dioxide -= amount; state.stats.vented += amount;
  if (amount) log(state, `安全排气 ${amount.toFixed(1)} 单位。失去了可回收的碳源。`);
  return amount;
}

export function serialize(state, now = Date.now()) { return JSON.stringify({ version: SAVE_VERSION, savedAt: now, state }); }

// 拒绝损坏、未知版本与不合理的嵌套状态；不将导入对象直接合并到运行状态。
export function restore(raw, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 300000) throw new Error('存档为空或过大');
  const envelope = JSON.parse(raw);
  const input = envelope?.state;
  if (envelope?.version !== SAVE_VERSION || input?.version !== SAVE_VERSION) throw new Error('不支持的存档版本');
  const numeric = (value, max = 1e9) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  const dict = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!numeric(envelope.savedAt, 1e15) || !numeric(input.seed, 4294967295) || !Number.isInteger(input.seed) || !numeric(input.elapsed) || !numeric(input.remainder, STEP)) throw new Error('存档时钟无效');
  for (const key of ['inventory', 'produced', 'upgrades', 'discovered', 'stats']) if (!dict(input[key])) throw new Error('存档字段缺失');
  for (const key of ['inventory', 'produced']) {
    if (Object.keys(input[key]).length !== Object.keys(MATERIALS).length || Object.keys(MATERIALS).some(id => !Object.hasOwn(input[key], id)) || Object.entries(input[key]).some(([id, n]) => !Object.hasOwn(MATERIALS, id) || !numeric(n))) throw new Error('库存数据无效');
  }
  if (Object.keys(input.upgrades).length !== Object.keys(UPGRADES).length || Object.keys(UPGRADES).some(id => !Object.hasOwn(input.upgrades, id)) || Object.entries(input.upgrades).some(([id, n]) => !Object.hasOwn(UPGRADES, id) || !Number.isInteger(n) || !numeric(n, UPGRADES[id].max))) throw new Error('升级数据无效');
  if (!Array.isArray(input.projects) || input.projects.length > PROJECTS.length || input.projects.some((id, i) => PROJECTS[i]?.id !== id)) throw new Error('项目进度无效');
  if (Object.entries(input.discovered).some(([id, n]) => !Object.hasOwn(RECIPE_BY_ID, id) || !Number.isInteger(n) || !numeric(n) || n === 0)) throw new Error('图鉴数据无效');
  if (!numeric(input.energy, energyCapacity(input)) || !numeric(input.heat, 120) || ['paused', 'cooling', 'overheated'].some(k => typeof input[k] !== 'boolean')) throw new Error('环境数据无效');
  if (['cycles', 'parallelCycles', 'recovered', 'vented'].some(k => !numeric(input.stats[k])) || (input.stats.autoCycles !== undefined && (!Number.isInteger(input.stats.autoCycles) || !numeric(input.stats.autoCycles, input.stats.cycles)))) throw new Error('统计数据无效');
  if (input.guide !== undefined && (!dict(input.guide) || typeof input.guide.enabled !== 'boolean')) throw new Error('引导设置无效');
  if (input.guide && ((input.guide.tab !== undefined && !['guide', 'project'].includes(input.guide.tab)) || (input.guide.collapsed !== undefined && typeof input.guide.collapsed !== 'boolean') || (input.guide.dock !== undefined && !['left', 'right'].includes(input.guide.dock)))) throw new Error('任务栏设置无效');
  const expected = [['furnace-1', 'basic'], ['furnace-2', 'basic']];
  if (input.projects.includes('workshop')) expected.push(['workshop-1', 'processor']);
  if (input.projects.includes('rift')) expected.push(['void-1', 'void']);
  if (!Array.isArray(input.machines) || input.machines.length !== expected.length) throw new Error('设备数量无效');
  for (const [i, machine] of input.machines.entries()) {
    if (!dict(machine) || machine.id !== expected[i][0] || machine.type !== expected[i][1] || !Array.isArray(machine.feeds) || new Set(machine.feeds).size !== machine.feeds.length || machine.feeds.length > 4 || machine.feeds.some(id => !Object.hasOwn(MATERIALS, id))) throw new Error('设备进料无效');
    if (!['low', 'medium', 'high', 'extreme'].includes(machine.temp) || !['balanced', 'boost'].includes(machine.mode) || typeof machine.running !== 'boolean' || !numeric(machine.cursor) || !numeric(machine.completed) || (machine.focus !== null && !input.discovered[machine.focus])) throw new Error('设备参数无效');
    if (machine.lastOutputs !== undefined && (!dict(machine.lastOutputs) || Object.entries(machine.lastOutputs).some(([id, n]) => !Object.hasOwn(MATERIALS, id) || !numeric(n, 100)))) throw new Error('设备产出记录无效');
    if (machine.running && !input.projects.includes('automation')) throw new Error('自动化尚未解锁');
    if (machine.batch) {
      const batch = machine.batch;
      if (batch.automatic !== undefined && typeof batch.automatic !== 'boolean') throw new Error('批次来源无效');
      if (!dict(batch) || !Array.isArray(batch.entries) || batch.entries.length < 1 || batch.entries.length > (input.upgrades.parallel ? 2 : 1) || !numeric(batch.duration, 30) || batch.duration === 0 || !numeric(batch.remaining, batch.duration) || !numeric(batch.energy, 100) || !numeric(batch.heat, 100) || !dict(batch.costs)) throw new Error('反应批次无效');
      if (new Set(batch.entries.map(e => e.recipeId)).size !== batch.entries.length) throw new Error('批次反应重复');
      for (const entry of batch.entries) {
        const candidate = candidates(input, machine).find(c => c.recipe.id === entry.recipeId);
        if (!candidate || !numeric(entry.chance, .95) || !dict(entry.maxOutputs) || JSON.stringify(entry.maxOutputs) !== JSON.stringify(outputMaximum(candidate))) throw new Error('批次产物无效');
      }
      if (Object.entries(batch.costs).some(([id, n]) => !MATERIALS[id] || !numeric(n, 100))) throw new Error('批次消耗无效');
    }
  }
  if (!Array.isArray(input.logs) || input.logs.length > 60 || input.logs.some(entry => !dict(entry) || !numeric(entry.time) || typeof entry.text !== 'string' || entry.text.length > 500 || !['info', 'success', 'project', 'discovery'].includes(entry.kind))) throw new Error('日志数据无效');
  const reserved = reservedOutputs(input);
  if (Object.keys(MATERIALS).some(id => input.inventory[id] + (reserved[id] || 0) > capacity(input, id) + EPS)) throw new Error('库存超出容量');
  const state = copy(input);
  state.guide = { enabled: true, tab: 'guide', collapsed: false, dock: 'right', ...state.guide };
  state.stats.autoCycles ??= 0;
  // UI 状态只展示经过引擎生成的文本，不信任导入的状态描述。
  state.machines.forEach(machine => { machine.status = machine.batch ? '继续处理存档批次' : '等待实验'; machine.lastOutputs ??= {}; });
  const offline = state.paused ? 0 : Math.min(OFFLINE_LIMIT, Math.max(0, (now - envelope.savedAt) / 1000));
  const before = { ...state.produced };
  advance(state, offline);
  const gains = Object.fromEntries(Object.keys(MATERIALS).map(id => [id, state.produced[id] - before[id]]).filter(([, n]) => n > 0));
  return { state, offline, gains };
}
