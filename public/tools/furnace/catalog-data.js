import { MATERIALS, RECIPES, SOURCES, MACHINE_TYPES, TEMPERATURES } from './data.js';
import { MATERIAL_BLUEPRINTS, RECIPE_BLUEPRINTS } from './catalog-plans.js';

export const CHAINS = {
  metallurgy: { name: '金属与合金', description: '矿石、粗炼、精炼、合金与结构成形。', ids: 'iron_ore copper_ore bauxite tin_ore lead_ore zinc_ore gold_ore silver_ore pyrite pig_iron blister_copper alumina crude_tin crude_lead crude_zinc crude_gold crude_silver sponge_iron steel refined_copper pure_aluminum pure_tin pure_lead pure_zinc pure_gold pure_silver alloy_steel brass bronze aluminum_alloy solder stainless_steel chromite nickel_ore pure_chromium pure_nickel steel_plate metal_scrap' },
  chemistry: { name: '气体与化工', description: '盐、水、空气与矿物提供独立物质来源，酸碱介质有首产与回收路径。', ids: 'water air salt brine sulfur_ore sulfur_dioxide sulfuric_acid hydrochloric_acid nitric_acid sodium_hydroxide ammonia nitrogen hydrogen oxygen chlorine hydrogen_peroxide trichlorosilane zinc_chloride calcium_chloride crude_oil plastic' },
  electronics: { name: '硅与电子', description: '还原硅、纯化、晶体生长、精密加工与组件装配。', ids: 'quartz_sand metallurgical_silicon electronic_silicon monocrystalline_silicon polycrystalline_silicon semiconductor_silicon silicon_wafer copper_wire circuit solder solar_cell' },
  energy: { name: '能源与储能', description: '燃料、碳材料、光能组件与蓄电单元；图鉴不会发放能量。', ids: 'coal coke natural_gas syngas graphite carbon_dioxide battery_cell solar_cell hydrogen crude_oil' },
  ecology: { name: '建材与循环', description: '炉渣、尾气、废水和余料回收，并预留农业与建材支路。', ids: 'limestone quicklime slag binder glass clay ceramic glass_fiber glass_scrap wastewater metal_scrap gypsum water carbon_dioxide phosphate_rock potash phosphoric_acid compound_fertilizer ammonium_nitrate urea calcium_chloride' },
  void: { name: '虚境与终局', description: '现实工业与虚境材料交汇；规划的终局材料不等于当前通关条件。', ids: 'void_dust void_stabilizer void_alloy void_semiconductor world_repair_component philosophers_stone void_core eternal_alloy perfect_semiconductor harmony_crystal anchor' },
};
const TAGS = { strong_acid: '强酸', sulfate: '硫酸盐', chloride: '氯化物', nitrate: '硝酸盐', strong_base: '强碱', organic: '有机物', electronic_grade: '电子级', high_purity: '高纯度', ammonium: '铵盐', moderate_acid: '酸性介质', phosphate: '磷酸盐', oxidant: '氧化剂', stabilizer: '稳定剂', ultimate: '终局', high_melting: '高熔点', iron: '铁系', metal: '金属', oxide: '氧化物', oxidizing: '氧化性', copper: '铜系', sulfide: '硫化物', aluminum: '铝系', hygroscopic: '吸湿', tin: '锡系', lead: '铅系', zinc: '锌系', precious: '贵金属', combustible: '可燃', nonmetal: '非金属', sulfur: '硫系', silicon: '硅系', alkaline: '碱性', carbon: '碳系', volatile: '挥发性', mixture: '混合物', energy_source: '能量载体', void: '虚境', void_contaminated: '虚境污染', brittle: '脆性', reducing: '还原性', porous: '多孔', ductile: '延展性', low_melting: '低熔点', acidic: '酸性', corrosive: '腐蚀性', semiconductor: '半导体', alloy: '合金', catalyst: '催化', fertilizer: '肥料', crystalline: '晶体', stable: '稳定', unstable: '不稳定', conductive: '导电', magnetic: '磁性', superconducting: '超导', world_repair: '世界修复', perfect: '完美', harmony: '调和', eternal: '永恒', radioactive: '放射性', halogen: '卤素', inert: '惰性' };
const DEVICE_NAMES = { ...Object.fromEntries(Object.entries(MACHINE_TYPES).map(([id, m]) => [id, m.name])), gas: '气相工坊', high_pressure: '高压工坊', electrolysis: '电解分离工坊', plasma: '等离子工坊' };
const liveNotes = { water: '基础采集资源，参与冷却与物料回收。', glass: '首章的密封与稳定化材料，后续可扩展纤维与精密装配。', binder: '首章的再生建材，连接炉渣回收与现实锚点。', circuit: '首章采用简化装配；图鉴另列硅片、铜线与焊料的规划长链。', anchor: '当前首章目标。规划中的世界修复组件与它是不同条目。', carbon_dioxide: '当前原型将含碳尾气合并计入此缓冲库存，不是纯气体分离模型。', copper_ore: '首章采用还原模型；图鉴保留粗铜、酸工业等较长的规划处理支路。' };
const symbols = { iron_ore:'Fe', copper_ore:'Cu', bauxite:'Al', tin_ore:'Sn', lead_ore:'Pb', zinc_ore:'Zn', gold_ore:'Au', silver_ore:'Ag', sulfur_ore:'S', pyrite:'FeS', quartz_sand:'Si', limestone:'Ca', coal:'C', natural_gas:'CH₄', air:'Air', void_dust:'Ψ', pig_iron:'Fe', blister_copper:'Cu', alumina:'Al₂O₃', crude_tin:'Sn', crude_lead:'Pb', crude_zinc:'Zn', crude_gold:'Au', crude_silver:'Ag', sulfur_dioxide:'SO₂', quicklime:'CaO', coke:'C', slag:'Sl', sponge_iron:'Fe', steel:'St', refined_copper:'Cu', pure_aluminum:'Al', pure_tin:'Sn', pure_lead:'Pb', pure_zinc:'Zn', pure_gold:'Au', pure_silver:'Ag', sulfuric_acid:'H₂SO₄', metallurgical_silicon:'Si', syngas:'Syn', alloy_steel:'Fe+', brass:'CuZn', bronze:'CuSn', aluminum_alloy:'Al+', solder:'SnPb', stainless_steel:'FeCr', hydrochloric_acid:'HCl', nitric_acid:'HNO₃', sodium_hydroxide:'NaOH', ammonia:'NH₃', urea:'N–C', trichlorosilane:'SiCl', electronic_silicon:'Si⁺', monocrystalline_silicon:'SiⅠ', polycrystalline_silicon:'SiⅡ', semiconductor_silicon:'Si*', void_stabilizer:'Ψ·', carbon_dioxide:'CO₂', void_alloy:'ΨFe', void_semiconductor:'ΨSi', compound_fertilizer:'NPK', ammonium_nitrate:'N', phosphoric_acid:'H₃PO₄', hydrogen_peroxide:'H₂O₂', chlorine:'Cl₂', hydrogen:'H₂', oxygen:'O₂', world_repair_component:'⌘+', philosophers_stone:'Φ', void_core:'Ψ●', eternal_alloy:'∞Fe', perfect_semiconductor:'∞Si', harmony_crystal:'◇', clay:'土', ceramic:'陶' };
const extraTiers = { water: 0, glass: 2, binder: 2, circuit: 3, anchor: 5 };
const blueprints = Object.fromEntries(MATERIAL_BLUEPRINTS.map(m => [m.id, m]));
export const CATALOG_MATERIALS = Object.fromEntries([...new Set([...Object.keys(blueprints), ...Object.keys(MATERIALS)])].map(id => {
  const draft = blueprints[id], live = MATERIALS[id];
  const categories = Object.entries(CHAINS).filter(([, chain]) => chain.ids.split(' ').includes(id)).map(([key]) => key);
  return [id, { ...draft, ...live, id, nameEn: draft?.nameEn || id.replaceAll('_', ' '), tier: draft?.tier ?? extraTiers[id],
    symbol: live?.symbol || symbols[id] || draft?.symbol, description: liveNotes[id] || draft?.description, tags: live?.tags || draft.tags.map(tag => TAGS[tag] || tag),
    source: SOURCES[id] ? '已接入：基础自动采集' : id === 'void_dust' ? '已接入：完成裂隙观测后采集' : draft?.source,
    categories, status: live ? 'active' : 'planned' }];
}));

// 当前可玩配方直接映射权威数据，不维护另一份容易漂移的投入/产出表。
const activeRecipes = RECIPES.map(r => ({ id: r.id, name: r.name, status: 'active', stage: r.stage, description: r.hint,
  device: r.type, deviceName: DEVICE_NAMES[r.type], temperature: TEMPERATURES[r.temp], seconds: r.seconds,
  inputs: r.roles.map(role => role.id ? { id: role.id, amount: role.amount } : { tag: role.tag, amount: role.amount, choices: Object.keys(MATERIALS).filter(id => MATERIALS[id].tags.includes(role.tag)) }),
  outputs: [{ id: r.output, amount: r.amount, bonus: r.bonus, secondary: false }, ...Object.entries(r.byproducts).map(([id, amount]) => ({ id, amount, secondary: true }))], origin: '当前生产规则' }));
const plannedRecipes = RECIPE_BLUEPRINTS.map(r => ({ ...r, status: 'planned', deviceName: DEVICE_NAMES[r.device],
  inputs: r.inputs.map(id => ({ id, amount: null })), outputs: [...r.outputs.map(id => ({ id, amount: null, secondary: false })), ...r.byproducts.map(id => ({ id, amount: null, secondary: true }))] }));
export const CATALOG_RECIPES = [...activeRecipes, ...plannedRecipes];
export const CATALOG_RECIPE_BY_ID = Object.fromEntries(CATALOG_RECIPES.map(r => [r.id, r]));
export const inputIds = recipe => recipe.inputs.flatMap(role => role.id ? [role.id] : role.choices);
export function producers(id) { return CATALOG_RECIPES.filter(r => r.outputs.some(o => o.id === id)); }
export function consumers(id) { return CATALOG_RECIPES.filter(r => inputIds(r).includes(id)); }
export function searchMaterials({ query = '', tier = '', category = '', status = '' } = {}) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return Object.values(CATALOG_MATERIALS).filter(m => (tier === '' || m.tier === Number(tier)) && (!category || m.categories.includes(category)) && (!status || m.status === status)
    && words.every(word => [m.id, m.name, m.nameEn, m.description, ...m.tags, ...m.categories.map(id => CHAINS[id].name)].join(' ').toLocaleLowerCase().includes(word)));
}

// 从有独立来源的材料开始求闭包；单纯“互相能合成”不算可达。
export function materialDepths(recipes = CATALOG_RECIPES) {
  const depth = Object.fromEntries(Object.values(CATALOG_MATERIALS).filter(m => m.source).map(m => [m.id, 0]));
  for (let pass = 0; pass < Object.keys(CATALOG_MATERIALS).length; pass++) {
    let changed = false;
    for (const r of recipes) {
      const level = 1 + Math.max(...r.inputs.map(role => role.id ? depth[role.id] ?? Infinity : Math.min(...role.choices.map(id => depth[id] ?? Infinity))));
      if (!Number.isFinite(level)) continue;
      for (const o of r.outputs) if ((depth[o.id] ?? Infinity) > level) { depth[o.id] = level; changed = true; }
    }
    if (!changed) break;
  }
  return depth;
}
const depths = materialDepths();
export function dependencyTree(id, { maxDepth = 4, maxNodes = 48, recipeId = null } = {}) {
  let count = 0;
  function walk(materialId, path, level, forced = null) {
    const base = { materialId };
    if (!CATALOG_MATERIALS[materialId]) return { ...base, kind: 'missing' };
    if (path.includes(materialId)) return { ...base, kind: 'cycle' };
    if (++count > maxNodes || level > maxDepth) return { ...base, kind: 'limit' };
    if (!forced && CATALOG_MATERIALS[materialId].source) return { ...base, kind: 'source' };
    const options = producers(materialId);
    const score = r => Math.max(...r.inputs.map(role => role.id ? depths[role.id] ?? Infinity : Math.min(...role.choices.map(id => depths[id] ?? Infinity))));
    options.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || score(a) - score(b));
    const recipe = forced ? options.find(r => r.id === forced) : options[0];
    if (!recipe) return { ...base, kind: 'missing' };
    return { ...base, kind: 'recipe', recipeId: recipe.id, children: recipe.inputs.map(role => walk(role.id || [...role.choices].sort((a, b) => (depths[a] ?? Infinity) - (depths[b] ?? Infinity))[0], [...path, materialId], level + 1)) };
  }
  return walk(id, [], 0, recipeId);
}
