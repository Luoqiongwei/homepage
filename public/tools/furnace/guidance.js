// 引导只观察真实状态。不会赠送物资、跳过生产或通过“下一步”伪造完成。
import { MATERIALS, RECIPE_BY_ID, PROJECTS, TEMPERATURES } from './data.js';
import { candidates, bindInputs, planBatch, sourceRates, powerRate, afford, upgradeCost, projectReady, availableRecipes, configureMachine, startBatch, toggleAuto, completeProject, buyUpgrade } from './simulation.js';

export const LESSONS = [
  { id: 'iron', name: '第一次炼铁', title: '先让第一份铁离开矿石', text: 'α 釜已预装铁矿石和煤炭。开始一批，观察原料扣除与倒计时；至少获得 2 生铁，原料会自动补充。', why: '进料选择代表供料通道，不是已经投入。只有点击开工时才扣料，倒计时结束后产物进入仓库。' },
  { id: 'copper', name: '发现铜', title: '让另一台釜产出铜', text: 'β 釜使用铜矿石与煤炭，温度仍为高温。相同的还原剂，可以参与不同金属的反应。', why: '材料身份决定产物来源，标签允许角色替代。焦炭以后也能替代煤炭；铁矿不会因为“金属”标签变成铜。' },
  { id: 'automation', name: '提交工程', title: '攒够材料，接通控制总线', text: '需要 6 生铁与 4 精炼铜。继续实验补足缺口，先保留材料给工程；每次实际产出都能提升熟练度。', why: '发现配方并不会解锁全部科技。工程要消耗真实库存，但解锁的能力会永久保留。' },
  { id: 'continuous', name: '连续生产', title: '让设备自己开始下一批', text: '开启一台釜的“连续生产”，并观察它自动完成一批。原料充足时，你不再需要反复点击实验。', why: '连续生产遇到缺电、过热、仓满或缺料会等待。关闭开关只阻止下一批，不会丢掉当前在制品。' },
  { id: 'cooling', name: '照顾散热', title: '先接通水冷，再扩大生产', text: '自动生产会累积废热。用 4 生铁与 2 精炼铜安装第一条水冷回路，观察热量逐步回落。', why: '热量达到 90 会触发保护；低于 65 后恢复。水冷耗水，无水时仍有自然散热，不会永久损坏设备。' },
  { id: 'steel', name: '改变进料', title: '把一台熔炼釜换成炼钢', text: '先停止 α 釜连续生产，等本批完成，再换成生铁＋煤炭，保持高温。炼钢会消耗此前产出的生铁。', why: '这是第一条上下游关系：铁矿→生铁→钢。有限工位需要轮换用途；切换之前必须处理好当前批次。' },
  { id: 'workshop', name: '循环工坊', title: '把炉渣变成下一座工坊的基础', text: '备齐 8 钢、8 精炼铜、6 炉渣，建造循环工坊。炉渣来自铁铜冶炼，不需要单独开采。', why: '副产物是回路的入口。工坊随后可将炉渣变成胶结料，把尾气变成燃料，也能装配电路。' },
];

export function lessonProgress(state) {
  const started = state.projects.includes('automation');
  const graduated = state.projects.includes('workshop');
  return [!!state.discovered.iron || started, !!state.discovered.copper || started, started,
    (state.stats.autoCycles || 0) > 0 || graduated, state.upgrades.cooling > 0 || graduated,
    !!state.discovered.steel || graduated, graduated];
}
const fixed = n => Number(n.toFixed(1));
const targetMachine = id => `[data-machine="${id}"]`;
const busy = (machine, recipe, text) => ({ kind: 'wait', label: '等待本批完成', target: targetMachine(machine.id), text: text || `${recipe.name}正在处理，还需约 ${Math.ceil(machine.batch.remaining)} 秒。无需再次投入原料。` });

export function blockerAdvice(state, machine, plan = planBatch(state, machine)) {
  if (plan.ok || plan.code === 'busy') return '';
  if (plan.code === 'paused') return '点击顶部“继续模拟”恢复。暂停期间，采集、散热和离线生产都会停止。';
  if (plan.code === 'heat') {
    const cooling = .7 + (state.cooling && state.inventory.water >= state.upgrades.cooling * .12 * .25 ? state.upgrades.cooling * .9 : 0);
    return `若没有其他批次继续放热，约 ${Math.max(1, Math.ceil((state.heat - 65) / cooling))} 秒后解除热保护。可停止其他釜连续生产，或安装水冷；不要暂停整个模拟，否则也会停止散热。`;
  }
  if (plan.code === 'energy') return `本批需 ${fixed(plan.required)} EU，还差 ${fixed(Math.max(0, plan.required - state.energy))} EU；没有其他设备抢用电力时，约 ${Math.ceil((plan.required - state.energy) / powerRate(state))} 秒可充足。`;
  if (plan.code === 'capacity') return plan.resource === 'carbon_dioxide'
    ? '尾气占满了产物缓冲空间。可以释放 15 单位腾出空间，或在循环工坊用尾气＋水回收碳；本次没有扣料。'
    : `${MATERIALS[plan.resource].name}没有足够的未预留空间。先消耗它、提交工程或升级缓冲仓；当前其他批次也可能占用了空间。本次没有扣料。`;
  if (plan.code === 'materials') {
    const rates = sourceRates(state);
    const items = Object.entries(plan.missing).map(([id, amount]) => `${MATERIALS[id].name}缺 ${fixed(amount)}${rates[id] ? `（单靠采集约 ${Math.ceil(amount / rates[id])} 秒）` : '（需要上游生产）'}`);
    return `${items.join('；')}。其他设备也在消耗时，实际等待会更久。`;
  }
  if (plan.code === 'focus') return '产出策略锁定了另一条反应。改成“混合 / 轮换有效反应”，或从实验笔记重新装载锁定配方。';
  if (plan.code === 'temperature') {
    const temps = [...new Set(candidates(state, machine, true).map(c => TEMPERATURES[c.recipe.temp]))];
    return `这组进料存在候选反应，可尝试 ${temps.join(' / ')}。没有匹配的温区不会扣料。`;
  }
  return '检查原料是否构成有效组合，而不只是填满槽位。初次可以恢复教学组合；其他线索在实验笔记中。';
}

function preset(state, recipe) {
  return recipe.roles.map(role => role.id || (state.inventory.coke >= role.amount ? 'coke' : 'coal'));
}

// 可装载已知反应；入门仅额外提供铁、铜、钢三条教学组合，不直接解锁配方。
export function loadRecipe(state, recipeId, machineId, teaching = false) {
  const recipe = RECIPE_BY_ID[recipeId];
  const machine = state.machines.find(m => m.id === machineId);
  const taught = ['iron', 'copper', 'steel'].includes(recipeId);
  if (!recipe || !machine || recipe.type !== machine.type || !availableRecipes(state).includes(recipe)) return { ok: false, reason: '反应或设备尚未开放' };
  if (!state.discovered[recipeId] && !(teaching && taught)) return { ok: false, reason: '先完成实验发现这条反应' };
  if (machine.batch || machine.running) return { ok: false, reason: '请先停止所选设备的连续生产，并等本批完成' };
  return configureMachine(state, machineId, { feeds: preset(state, recipe), temp: recipe.temp, mode: 'balanced', focus: state.discovered[recipeId] ? recipeId : null });
}

function recipeAction(state, recipeId, preferred, auto = false, visited = []) {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe || visited.includes(recipeId)) return { kind: 'locate', label: '查看实验笔记', target: '#notebook-view', text: '检查上游物料与可用的反应路线。' };
  const machines = state.machines.filter(m => m.type === recipe.type);
  const fitting = machines.filter(m => candidates(state, m).some(c => c.recipe.id === recipeId) && (!m.focus || m.focus === recipeId));
  // 优先实际执行该路线的设备，再选择不需要打断其他产线的设备。
  const machine = fitting.find(m => m.batch?.entries.some(e => e.recipeId === recipeId)) || fitting.find(m => !m.batch)
    || machines.find(m => m.id === preferred) || machines.find(m => !m.batch && !m.running) || machines[0];
  if (!machine) return { kind: 'locate', label: '查看重建计划', target: '.project-panel', text: '先完成工程以开放所需设备。' };
  const target = targetMachine(machine.id);
  if (machine.batch) {
    if (machine.batch.entries.some(e => e.recipeId === recipeId)) {
      if (auto && !machine.running) return { kind: 'auto', machineId: machine.id, label: '开启这台釜的连续生产', target: `[data-auto="${machine.id}"]`, text: '当前手动批次会先完成，随后自动补开新批次。' };
      return busy(machine, recipe);
    }
    if (machine.running) return { kind: 'stop', machineId: machine.id, label: '先停止这台釜连续生产', target: `[data-auto="${machine.id}"]`, text: `${machine.id} 正在处理另一条路线。关闭连续后，等本批完成再换料；不会丢弃在制品。` };
    return busy(machine, recipe, `先等 ${machine.id} 的当前批次完成（约 ${Math.ceil(machine.batch.remaining)} 秒），再调整进料。`);
  }
  // 先补足中间品再装载下游，避免同一釜在“炼铁/炼钢”之间反复换料却不开工。
  const needed = bindInputs(recipe, preset(state, recipe)).inputs;
  const missingProduct = Object.keys(needed).find(id => state.inventory[id] + 1e-8 < needed[id] && !sourceRates(state)[id]);
  const producer = availableRecipes(state).find(r => r.output === missingProduct || r.byproducts[missingProduct]);
  if (producer) {
    const action = recipeAction(state, producer.id, undefined, false, [...visited, recipeId]);
    return { ...action, text: `先补充上游 ${MATERIALS[missingProduct].name}，再生产${MATERIALS[recipe.output].name}。${action.text}` };
  }
  const match = candidates(state, machine).find(c => c.recipe.id === recipeId);
  if (!match || (machine.focus && machine.focus !== recipeId)) {
    if (machine.running) return { kind: 'stop', machineId: machine.id, label: '停止连续，准备换料', target: `[data-auto="${machine.id}"]`, text: '先关闭连续生产，再明确调整所选设备；其他设备不会被改动。' };
    const taught = ['iron', 'copper', 'steel'].includes(recipeId);
    return { kind: state.discovered[recipeId] || taught ? 'load' : 'locate', recipeId, machineId: machine.id,
      label: state.discovered[recipeId] ? `装载「${recipe.name}」` : taught ? '装载教学组合' : '查看这条反应的线索',
      target: state.discovered[recipeId] || taught ? target : `[data-recipe="${recipeId}"]`,
      text: state.discovered[recipeId] || taught ? `将 ${machine.id} 设为 ${preset(state, recipe).map(id => MATERIALS[id].name).join('＋')}，${TEMPERATURES[recipe.temp]}。只改配置，不消耗材料，也不自动开工。` : recipe.hint };
  }
  const plan = planBatch(state, machine);
  if (plan.ok && !plan.entries.some(entry => entry.recipeId === recipeId)) {
    if (machine.running) return { kind: 'stop', machineId: machine.id, label: '停止连续，准备锁定路线', target: `[data-auto="${machine.id}"]`, text: '混合进料正在轮换另一条反应。先停止连续生产，再装载当前目标组合。' };
    const canLoad = state.discovered[recipeId] || ['iron', 'copper', 'steel'].includes(recipeId);
    return { kind: canLoad ? 'load' : 'locate', recipeId, machineId: machine.id, label: canLoad ? '装载当前目标组合' : '查看这条反应的线索', target: canLoad ? target : `[data-recipe="${recipeId}"]`, text: canLoad ? '当前混合进料下一批会执行另一条反应。装载目标组合后再开工，不会额外赠送产物。' : recipe.hint };
  }
  if (!plan.ok) {
    if (plan.code === 'materials') {
      const missing = Object.keys(match.inputs).find(id => state.inventory[id] < match.inputs[id] && !sourceRates(state)[id]);
      const upstream = availableRecipes(state).find(r => r.output === missing || r.byproducts[missing]);
      if (upstream) {
        const action = recipeAction(state, upstream.id, undefined, false, [...visited, recipeId]);
        return { ...action, text: `先补充上游 ${MATERIALS[missing].name}，再生产${MATERIALS[recipe.output].name}。${action.text}` };
      }
    }
    return { kind: plan.code === 'capacity' ? 'locate' : 'wait', label: plan.code === 'capacity' ? '查看仓储与回收' : '等待条件恢复',
      target: plan.code === 'capacity' ? plan.resource === 'carbon_dioxide' ? '#vent-button' : '.inventory-panel' : target,
      text: blockerAdvice(state, machine, plan) };
  }
  if (machine.running) return { kind: 'wait', label: '连续生产已安排', target, text: `设备会自动补开「${recipe.name}」。原料、电力或空间不足时会等待。` };
  if (auto) return { kind: 'auto', machineId: machine.id, label: '开启这台釜的连续生产', target: `[data-auto="${machine.id}"]`, text: '开关打开后，调度器会自动投入原料、开工并收取产物。' };
  return { kind: 'start', machineId: machine.id, label: `开始一批${MATERIALS[recipe.output].name}`, target: `[data-start="${machine.id}"]`, text: `本批预计 ${plan.duration} 秒。开工时扣料，至少获得 ${recipe.amount} ${MATERIALS[recipe.output].name}，额外收率由条件与熟练度决定。` };
}

function requirementsAction(state, costs) {
  const id = Object.keys(costs).find(id => state.inventory[id] + 1e-8 < costs[id]);
  if (!id) return null;
  const recipe = availableRecipes(state).find(r => r.output === id || r.byproducts[id]);
  if (!recipe) return { kind: 'wait', label: '等待自动采集', target: '.inventory-panel', text: `${MATERIALS[id].name}正在采集。` };
  const action = recipeAction(state, recipe.id, recipe.id === 'copper' ? 'furnace-2' : 'furnace-1');
  return { ...action, text: `${MATERIALS[id].name}还差 ${fixed(costs[id] - state.inventory[id])}。${action.text}` };
}

export function getGuide(state) {
  const completed = lessonProgress(state);
  let index = completed.findIndex(done => !done);
  if (index < 0) index = LESSONS.length;
  const lesson = LESSONS[index];
  let requirements = {}, action;
  if (lesson?.id === 'iron' || lesson?.id === 'copper' || lesson?.id === 'steel') action = recipeAction(state, lesson.id, lesson.id === 'copper' ? 'furnace-2' : 'furnace-1');
  if (lesson?.id === 'automation' || lesson?.id === 'workshop') {
    const project = PROJECTS.find(p => p.id === lesson.id); requirements = project.cost;
    action = projectReady(state, project.id) ? { kind: 'project', projectId: project.id, label: `提交材料 · ${project.name}`, target: '#project-submit', text: '所需库存已备齐。提交会消耗清单中的材料，并永久开放下一阶段。' } : requirementsAction(state, requirements);
  }
  if (lesson?.id === 'continuous') action = recipeAction(state, 'iron', 'furnace-1', true);
  if (lesson?.id === 'cooling') {
    requirements = upgradeCost(state, 'cooling');
    action = afford(state, requirements) ? { kind: 'upgrade', upgradeId: 'cooling', label: '安装第一条水冷回路', target: '[data-upgrade="cooling"]', text: '安装后水冷自动启用，每秒耗水 0.12、额外散热 0.9。' } : requirementsAction(state, requirements);
  }
  if (!lesson) {
    const project = PROJECTS.find(p => !state.projects.includes(p.id));
    requirements = project?.cost || {};
    action = !project ? { kind: 'locate', label: '回看实验笔记', target: '#notebook-view', text: '首章已完成，你可以继续优化回收与混炼。' }
      : projectReady(state, project.id) ? { kind: 'project', projectId: project.id, label: `提交材料 · ${project.name}`, target: '#project-submit', text: '工程材料已备齐。' } : requirementsAction(state, requirements);
  }
  if (state.paused) action = { kind: 'resume', label: '继续模拟，接着引导', target: '#pause-button', text: '当前全站暂停，生产和采集都不会推进。恢复后会接着你已有的真实进度。' };
  return {
    id: lesson?.id || 'graduated', index, completed, requirements,
    title: lesson?.title || (state.projects.includes('anchor') ? '这座工厂已经有了自己的秩序' : '入门完成，开始规划你的工业网络'),
    text: lesson?.text || '接下来只给工程线索，不再代替你安排产线。你可以从实验笔记装载已知配方，或尝试新的组合。',
    why: lesson?.why || '围绕工程目标建立上游供给，再把副产物送回循环。按需要切换设备，别让一条产线耗尽另一条的关键原料。',
    action: action || { kind: 'locate', label: '查看重建计划', target: '.project-panel', text: '查看工程中的剩余条件。' },
  };
}

export function performGuideAction(state, action) {
  switch (action.kind) {
    case 'resume': state.paused = false; return { ok: true };
    case 'start': return startBatch(state, action.machineId);
    case 'load': return loadRecipe(state, action.recipeId, action.machineId, true);
    case 'auto': {
      const machine = state.machines.find(m => m.id === action.machineId);
      return machine?.running ? { ok: true } : toggleAuto(state, action.machineId);
    }
    case 'stop': {
      const machine = state.machines.find(m => m.id === action.machineId);
      return !machine?.running ? { ok: true } : toggleAuto(state, action.machineId);
    }
    case 'project': return completeProject(state, action.projectId);
    case 'upgrade': {
      const result = buyUpgrade(state, action.upgradeId);
      if (result.ok && action.upgradeId === 'cooling') state.cooling = true;
      return result;
    }
    default: return { ok: false, reason: '此步骤需要等待或查看界面' };
  }
}
