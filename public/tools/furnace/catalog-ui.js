import { PROJECTS } from './data.js';
import { CATALOG_MATERIALS as materials, CATALOG_RECIPES as recipes, CATALOG_RECIPE_BY_ID, CHAINS, searchMaterials, producers, consumers, dependencyTree } from './catalog-data.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let root, readState, onNavigate, selected = 'iron_ore', selectedRecipe = null, history = [], signature = '';
const filters = { query: '', tier: '', category: '', status: '' };
let reveal = false;
const $ = id => root.querySelector(`#${id}`);
const badge = status => `<span class="catalog-badge ${status}">${status === 'active' ? '已接入' : '规划中'}</span>`;
const materialButton = (id, amount = null) => `<button class="material-link" data-material="${escape(id)}">${escape(materials[id].name)}${amount === null ? '' : ` ×${amount}`}</button>`;
const canRead = recipe => recipe.status === 'planned' || reveal || !!readState().discovered[recipe.id];

export function mountCatalog(element, getState, onSelect) {
  root = element; readState = getState; onNavigate = onSelect;
  const active = Object.values(materials).filter(m => m.status === 'active').length;
  document.getElementById('catalog-count').textContent = Object.keys(materials).length;
  root.innerHTML = `<div class="view-heading"><div><h2>材料与工艺图鉴</h2><p>${Object.keys(materials).length} 种材料 · ${recipes.length} 条路线 · ${active} 种材料 / ${recipes.filter(r => r.status === 'active').length} 条路线已接入</p></div></div>
    <p class="catalog-notice">图鉴预览不会解锁配方、生成库存或改变工程。<strong>规划中</strong>的路线是工艺关系草案，投料数量、能耗与设备参数待定；不作为现实化学操作说明。</p>
    <div class="catalog-filters"><label class="catalog-search">搜索材料<input id="catalog-search" type="search" placeholder="名称、标签或英文 ID" autocomplete="off"></label><label>产业链<select id="catalog-category"><option value="">全部产业链</option>${Object.entries(CHAINS).map(([id, c]) => `<option value="${id}">${c.name}</option>`).join('')}</select></label><label>层级<select id="catalog-tier"><option value="">全部层级</option>${[0, 1, 2, 3, 4, 5].map(t => `<option value="${t}">T${t}</option>`).join('')}</select></label><label>接入状态<select id="catalog-status"><option value="">全部状态</option><option value="active">已接入生产规则</option><option value="planned">规划中</option></select></label><button id="catalog-clear" class="secondary">清除筛选</button></div>
    <div class="catalog-caption"><p id="catalog-result-count" role="status"></p><label><input id="catalog-reveal" type="checkbox"> 预览尚未发现的生产配方（含剧透）</label></div>
    <p class="catalog-chain-note" id="catalog-chain-note"></p>
    <div class="catalog-layout"><div id="catalog-materials" class="catalog-materials" aria-label="材料列表"></div><article id="catalog-detail" class="catalog-detail panel" aria-label="材料详情"></article></div>`;
  $('catalog-search').addEventListener('input', e => { filters.query = e.target.value; renderList(); });
  for (const field of ['category', 'tier', 'status']) $(`catalog-${field}`).addEventListener('change', e => { filters[field] = e.target.value; renderList(); });
  $('catalog-clear').onclick = () => { clearFilters(); renderList(); };
  $('catalog-reveal').onchange = event => { reveal = event.target.checked; renderDetail(); };
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.material) goTo(button.dataset.material);
    if (button.dataset.trace) {
      const recipe = CATALOG_RECIPE_BY_ID[button.dataset.trace];
      if (!canRead(recipe)) return;
      const id = recipe.outputs.some(o => o.id === selected) ? selected : recipe.outputs[0].id;
      if (id !== selected) goTo(id);
      selectedRecipe = recipe.id; renderDetail();
      $('catalog-tree').open = true;
      $('catalog-tree').scrollIntoView({ block: 'nearest' });
    }
    if (button.id === 'catalog-back' && history.length) {
      selected = history.pop(); selectedRecipe = null; clearFilters(); renderList();
    }
  });
  renderList();
}

function clearFilters() {
  for (const field of Object.keys(filters)) { filters[field] = ''; $(`catalog-${field === 'query' ? 'search' : field}`).value = ''; }
}
function goTo(id) {
  if (!materials[id]) return;
  if (selected && selected !== id) history = [...history.slice(-19), selected];
  selected = id; selectedRecipe = null;
  // 关联链接可以跳到原筛选之外的材料，清空筛选避免“详情有条目、列表找不到”。
  if (!searchMaterials(filters).some(m => m.id === id)) clearFilters();
  renderList(); onNavigate?.();
  if (matchMedia('(max-width: 600px)').matches) $('catalog-detail').scrollIntoView({ block: 'start' });
}
function renderList() {
  const list = searchMaterials(filters);
  if (!list.some(m => m.id === selected)) { selected = list[0]?.id || null; selectedRecipe = null; }
  $('catalog-result-count').textContent = `${list.length} / ${Object.keys(materials).length} 种材料`;
  $('catalog-chain-note').textContent = filters.category ? CHAINS[filters.category].description : '层级是内容分类，不是当前科技解锁顺序。点击材料查看来源、替代路线和下游用途。';
  $('catalog-materials').innerHTML = list.length ? list.map(m => `<button class="catalog-material ${m.id === selected ? 'selected' : ''}" data-material="${m.id}" aria-pressed="${m.id === selected}"><span class="catalog-symbol" style="color:${escape(m.color)}">${escape(m.symbol)}</span><span><strong>${escape(m.name)}</strong><small>T${m.tier} · ${m.status === 'active' ? '已接入' : '规划中'}</small></span></button>`).join('') : '<p class="catalog-empty">没有匹配的材料。试试其他关键词或清除筛选。</p>';
  renderDetail();
}

function routeCard(recipe, downstream = false) {
  const readable = canRead(recipe);
  const locked = recipe.stage && !readState().projects.includes(recipe.stage);
  const stage = locked ? ` · 需要「${PROJECTS.find(p => p.id === recipe.stage).name}」` : '';
  const inputs = recipe.inputs.map(role => role.id ? materialButton(role.id, role.amount) : `<span class="role-alternatives">[${escape(role.tag)}] ×${role.amount}：${role.choices.map(id => materialButton(id)).join(' 或 ')}</span>`).join('<span class="formula-plus">＋</span>');
  const outputs = recipe.outputs.map(o => `<span class="route-output">${o.secondary ? '<small>副产 / 联产</small>' : ''}${materialButton(o.id, o.amount)}${o.bonus ? `<small>随机额外 +${o.bonus}</small>` : ''}</span>`).join('<span class="formula-plus">＋</span>');
  return `<article class="catalog-route"><div class="catalog-route-head"><h4>${readable ? escape(recipe.name) : '未发现的生产反应'}</h4>${badge(recipe.status)}</div>
    <p class="catalog-route-meta">${escape(recipe.deviceName)}${recipe.status === 'active' ? ` · ${recipe.temperature} · ${recipe.seconds}s / 批${escape(stage)}` : ' · 规划设备 / 参数待定'}</p>
    ${readable ? `<div class="catalog-formula"><div>${inputs}</div><span class="route-arrow">↓ ${downstream ? '下游加工' : '获得材料'}</span><div>${outputs}</div></div>` : '<p class="catalog-hidden">先实际完成实验，或勾选上方配方预览。查看图鉴不算发现。</p>'}
    <p class="catalog-route-description">${escape(recipe.description)}</p>
    <div class="catalog-route-foot"><small>${recipe.status === 'planned' ? '只表示物料关系 · 计量与能耗待平衡' : '按当前规则扣料 · 基础产出有保证'}</small>${readable ? `<button class="text-button" data-trace="${recipe.id}">追溯此路线 ↗</button>` : ''}</div></article>`;
}
function treeNode(node) {
  const notes = { source: materials[node.materialId]?.source, cycle: '循环回路：在此截断，可点击继续查看', limit: '深度 / 数量上限：点击材料继续', missing: '尚无来源定义' };
  if (node.kind !== 'recipe') return `<li>${materialButton(node.materialId)}<small>${escape(notes[node.kind])}</small></li>`;
  const recipe = CATALOG_RECIPE_BY_ID[node.recipeId];
  const readable = canRead(recipe);
  return `<li>${materialButton(node.materialId)}<small>${readable ? escape(recipe.name) : '未发现反应 · 预览关闭'} · ${recipe.status === 'active' ? '已接入' : '规划中'}</small>${readable ? `<ul>${node.children.map(treeNode).join('')}</ul>` : ''}</li>`;
}
function renderDetail() {
  if (!selected) { $('catalog-detail').innerHTML = '<p class="catalog-empty">没有材料可展示。清除筛选后继续探索。</p>'; return; }
  const m = materials[selected], from = producers(selected), to = consumers(selected);
  const openSections = new Set([...$('catalog-detail').querySelectorAll('details[open]')].map(el => el.id));
  $('catalog-detail').innerHTML = `<div class="catalog-detail-head"><div><span class="eyebrow">MATERIAL / T${m.tier}</span><h3>${escape(m.name)}</h3><code>${escape(m.id)}</code></div>${badge(m.status)}</div>
    <button class="text-button" id="catalog-back" ${history.length ? '' : 'disabled'}>← 返回上个材料</button>
    <p class="catalog-description">${escape(m.description)}</p>
    <div class="catalog-tags">${[...m.categories.map(id => CHAINS[id].name), ...m.tags].map(t => `<span>${escape(t)}</span>`).join('')}</div>
    <p class="catalog-source">${escape(m.source || '制造获得：见下方来源路线。')}${m.status === 'planned' ? ' · 尚未加入采集、背包或生产。' : ' · 配方与设备仍按现有工程进度开放。'}</p>
    <details id="catalog-tree" ${openSections.has('catalog-tree') ? 'open' : ''}><summary>来源树 · ${selectedRecipe ? '已选路线' : '优先当前规则，其次较短规划路径'}</summary><p class="catalog-tree-note">只展示一条示例上游，角色替代选一种。下方可追溯其他路线；深度限制避免回收环无限展开。</p><ul class="dependency-tree">${treeNode(dependencyTree(selected, { recipeId: selectedRecipe }))}</ul></details>
    <section class="catalog-routes"><h3>来源路线 <span>${from.length}</span></h3>${from.length ? from.map(r => routeCard(r)).join('') : '<p class="catalog-empty">此材料通过采集取得，暂无制造路线。</p>'}</section>
    <details id="catalog-downstream" ${openSections.has('catalog-downstream') ? 'open' : ''}><summary>下游用途 · ${to.length} 条路线</summary>${to.length ? to.map(r => routeCard(r, true)).join('') : '<p class="catalog-empty">终端材料 / 后续用途待设计；图鉴不会自动把它变成工程奖励。</p>'}</details>`;
}

export function refreshCatalog(state) {
  if (!root) return;
  const next = JSON.stringify([state.projects, Object.keys(state.discovered)]);
  if (next === signature) return;
  signature = next; renderDetail();
}
