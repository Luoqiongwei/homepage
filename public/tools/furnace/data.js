// v0.3 的唯一运行数据源。数量为游戏单位，不是化学计量或现实操作指南。
export const MATERIALS = {
  iron_ore: { name: '铁矿石', symbol: 'Fe', group: 'raw', tags: ['含铁', '氧化物'], color: '#bb8771' },
  copper_ore: { name: '铜矿石', symbol: 'Cu', group: 'raw', tags: ['含铜', '氧化物'], color: '#cf9b68' },
  coal: { name: '煤炭', symbol: 'C', group: 'raw', tags: ['可燃', '还原剂'], color: '#a2a6ae' },
  quartz_sand: { name: '石英砂', symbol: 'Si', group: 'raw', tags: ['含硅', '高熔点'], color: '#bfd8da' },
  water: { name: '水', symbol: 'H₂O', group: 'raw', tags: ['液态', '冷却剂'], color: '#70b2d0' },
  coke: { name: '焦炭', symbol: 'C+', group: 'product', tags: ['可燃', '还原剂', '高纯'], color: '#c0b8a1' },
  pig_iron: { name: '生铁', symbol: 'Fe', group: 'product', tags: ['含铁', '金属'], color: '#b8a08b' },
  refined_copper: { name: '精炼铜', symbol: 'Cu', group: 'product', tags: ['含铜', '导电'], color: '#d69b6a' },
  steel: { name: '钢', symbol: 'St', group: 'product', tags: ['含铁', '结构材料'], color: '#a7c2ce' },
  metallurgical_silicon: { name: '冶金硅', symbol: 'Si', group: 'product', tags: ['含硅', '半导体'], color: '#90b9bf' },
  glass: { name: '玻璃', symbol: 'Gl', group: 'product', tags: ['含硅', '容器'], color: '#a6d6cc' },
  circuit: { name: '控制电路', symbol: 'IC', group: 'product', tags: ['导电', '自动化'], color: '#79c6a7' },
  binder: { name: '矿物胶结料', symbol: 'Bd', group: 'product', tags: ['建材', '再生'], color: '#c6b58b' },
  slag: { name: '炉渣', symbol: 'Sl', group: 'byproduct', tags: ['矿物', '可回收'], color: '#a7a398' },
  carbon_dioxide: { name: '尾气 / CO₂', symbol: 'CO₂', group: 'byproduct', tags: ['气态', '可回收'], color: '#b3afb9' },
  void_dust: { name: '虚境粉尘', symbol: 'Ψ', group: 'void', tags: ['虚态', '不稳定'], color: '#bca2df' },
  void_stabilizer: { name: '虚境稳定剂', symbol: 'Ψ·', group: 'void', tags: ['虚态', '稳定'], color: '#ccbbec' },
  anchor: { name: '现实锚点', symbol: '⌘', group: 'void', tags: ['终局', '秩序'], color: '#e0ce9b' },
};

export const TEMPERATURES = { low: '低温', medium: '中温', high: '高温', extreme: '极高温' };
export const SOURCES = { iron_ore: 0.40, copper_ore: 0.27, coal: 0.42, quartz_sand: 0.20, water: 0.35 };
const exact = (id, amount) => ({ id, amount });
const reducer = amount => ({ tag: '还原剂', amount, preferred: 'coke' });
export const RECIPES = [
  { id: 'carbonize', name: '煤炭焦化', type: 'basic', temp: 'low', stage: null,
    roles: [exact('coal', 3)], output: 'coke', amount: 2, bonus: 1, chance: .55, byproducts: { carbon_dioxide: 1 }, seconds: 6, energy: 5, heat: 5,
    hint: '低温处理可燃原料，寻找更纯净的还原剂。', family: '碳质处理' },
  { id: 'iron', name: '铁矿还原', type: 'basic', temp: 'high', stage: null,
    roles: [exact('iron_ore', 3), reducer(2)], output: 'pig_iron', amount: 2, bonus: 1, chance: .65, byproducts: { slag: 1, carbon_dioxide: 1 }, seconds: 8, energy: 9, heat: 10,
    hint: '含铁氧化物与还原剂相遇，高温能释放其中的金属。', family: '金属还原' },
  { id: 'copper', name: '铜矿还原', type: 'basic', temp: 'high', stage: null,
    roles: [exact('copper_ore', 3), reducer(1)], output: 'refined_copper', amount: 2, bonus: 1, chance: .65, byproducts: { slag: 1, carbon_dioxide: 1 }, seconds: 8, energy: 8, heat: 8,
    hint: '含铜氧化物也能与还原剂共炼；它与铁矿适用相同温区。', family: '金属还原' },
  { id: 'steel', name: '钢材精炼', type: 'basic', temp: 'high', stage: 'automation',
    roles: [exact('pig_iron', 3), reducer(1)], output: 'steel', amount: 2, bonus: 1, chance: .55, byproducts: { carbon_dioxide: 1 }, seconds: 10, energy: 12, heat: 12,
    hint: '把初炼铁材送回高温釜，配合还原剂获得结构材料。', family: '金属精炼' },
  { id: 'glass', name: '玻璃熔制', type: 'basic', temp: 'high', stage: 'automation',
    roles: [exact('quartz_sand', 3)], output: 'glass', amount: 2, bonus: 1, chance: .55, byproducts: {}, seconds: 8, energy: 10, heat: 9,
    hint: '单独加热含硅矿物，可以得到密封与稳定化所需的容器。', family: '硅酸盐加工' },
  { id: 'silicon', name: '硅矿还原', type: 'basic', temp: 'extreme', stage: 'workshop',
    roles: [exact('quartz_sand', 3), reducer(2)], output: 'metallurgical_silicon', amount: 2, bonus: 1, chance: .55, byproducts: { carbon_dioxide: 2 }, seconds: 12, energy: 18, heat: 16,
    hint: '比玻璃更高的温度，加上还原剂，能释放半导体材料。', family: '高温还原' },
  { id: 'recycle', name: '炉渣再生', type: 'processor', temp: 'low', stage: 'workshop',
    roles: [exact('slag', 3), exact('water', 1)], output: 'binder', amount: 2, bonus: 0, chance: 0, byproducts: {}, seconds: 6, energy: 5, heat: 2,
    hint: '以水润湿炉渣，在低温工坊中制备再生建材。', family: '矿物回收' },
  { id: 'capture', name: '生物膜固碳', type: 'processor', temp: 'low', stage: 'workshop',
    roles: [exact('carbon_dioxide', 3), exact('water', 2)], output: 'coal', amount: 1, bonus: 0, chance: 0, byproducts: {}, seconds: 8, energy: 7, heat: 2,
    hint: '尾气与水进入低温生物膜，消耗电力回收碳质燃料。', family: '碳循环' },
  { id: 'circuit', name: '控制电路装配', type: 'processor', temp: 'medium', stage: 'workshop',
    roles: [exact('refined_copper', 2), exact('metallurgical_silicon', 1)], output: 'circuit', amount: 1, bonus: 1, chance: .45, byproducts: {}, seconds: 10, energy: 10, heat: 5,
    hint: '导电金属与半导体在中温工坊中构成控制元件。', family: '精密装配' },
  { id: 'stabilize', name: '虚境稳定化', type: 'void', temp: 'medium', stage: 'rift',
    roles: [exact('void_dust', 2), exact('glass', 1)], output: 'void_stabilizer', amount: 1, bonus: 1, chance: .45, byproducts: {}, seconds: 12, energy: 15, heat: 10,
    hint: '玻璃容器承载虚境粉尘，在中温下保持秩序。', family: '虚境调和' },
  { id: 'anchor', name: '现实锚点装配', type: 'processor', temp: 'medium', stage: 'rift',
    roles: [exact('steel', 5), exact('circuit', 3), exact('void_stabilizer', 2), exact('binder', 3)], output: 'anchor', amount: 1, bonus: 0, chance: 0, byproducts: {}, seconds: 16, energy: 20, heat: 10,
    hint: '钢为骨架、电路为控制、稳定剂调和虚境、再生建材承载基础。', family: '现实锚定' },
];

export const MACHINE_TYPES = {
  basic: { name: '熔炼釜', mark: 'F', color: '#d2a675' },
  processor: { name: '循环工坊', mark: 'R', color: '#79bfb0' },
  void: { name: '虚境调和釜', mark: 'Ψ', color: '#b89dd6' },
};
export const PROJECTS = [
  { id: 'automation', name: '重启控制总线', subtitle: '01 / 从实验到连续生产', requires: null, discoveries: 2,
    cost: { pig_iron: 6, refined_copper: 4 }, reward: '解锁连续生产、钢材、玻璃与混炼升级。',
    guidance: '先用预装的两台熔炼釜各实验几批，获得铁与铜。原料会自动补充。' },
  { id: 'workshop', name: '建造循环工坊', subtitle: '02 / 让副产物回到产线', requires: 'automation',
    cost: { steel: 8, refined_copper: 8, slag: 6 }, reward: '新增循环工坊，开放硅材料、电路、炉渣与尾气回收。',
    guidance: '将一台釜换成生铁＋煤炭，高温精炼钢材。保留另一台生产铜。' },
  { id: 'rift', name: '打开裂隙观测窗', subtitle: '03 / 接触虚境', requires: 'workshop',
    cost: { circuit: 6, glass: 8, binder: 8 }, reward: '新增虚境调和釜与粉尘采集，解锁现实锚点。',
    guidance: '高温石英制玻璃；极高温石英＋还原剂制硅。工坊加工铜＋硅、电路之外再回收炉渣。' },
  { id: 'anchor', name: '点亮第一枚现实锚点', subtitle: '04 / 为世界留下一个稳定的坐标', requires: 'rift',
    cost: { anchor: 1 }, reward: '完成 v0.3 首章。产线继续运行，可继续优化循环与混炼。',
    guidance: '虚境釜：粉尘＋玻璃，中温。工坊：钢＋电路＋稳定剂＋胶结料，中温。' },
];

export const UPGRADES = {
  extraction: { name: '采集臂', max: 4, stage: 'automation', cost: { pig_iron: 4, refined_copper: 2 }, effect: '每级使全部原料采集 +50%（基础值）' },
  power: { name: '光能阵列', max: 4, stage: 'automation', cost: { refined_copper: 4, steel: 2 }, effect: '每级供电 +0.9/s，电池容量 +30' },
  cooling: { name: '水冷回路', max: 3, stage: null, cost: { pig_iron: 4, refined_copper: 2 }, effect: '每级额外散热 0.9/s，耗水 0.12/s；无水退回自然散热' },
  parallel: { name: '双路混炼', max: 1, stage: 'automation', cost: { steel: 6, refined_copper: 5 }, effect: '两条不同有效反应可同批运行；原料照扣，总能耗减 18%' },
  storage: { name: '缓冲仓扩容', max: 3, stage: 'workshop', cost: { binder: 5, steel: 3 }, effect: '每级各类库存容量 +100%，尾气也单独扩容' },
};
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(recipe => [recipe.id, recipe]));
