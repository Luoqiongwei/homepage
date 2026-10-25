/** @typedef {{ state: string, write: string, direction: 'L' | 'R' | 'S', line: number }} Transition */
/** @typedef {Map<string, Map<string, Transition>>} Program */
/** @typedef {Transition & { fromState: string, read: string }} ExecutedTransition */
/** @typedef {null | 'terminal' | 'missing'} HaltReason */

const blankSymbols = new Set(['B', '_', '□', '＿']);

/** @param {string} symbol */
function normalizeSymbol(symbol) {
  return blankSymbols.has(symbol) ? '_' : symbol;
}

/** @param {number} line @param {string} message */
function programError(line, message) {
  return Object.assign(new Error(`第 ${line} 行：${message}`), { line });
}

/**
 * 编译整份程序；任何一行有误都不返回部分结果。
 * @param {string} source
 * @returns {Program}
 */
export function parseProgram(source) {
  /** @type {Program} */
  const program = new Map();

  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = index + 1;
    const text = rawLine.trim();
    if (!text || text.startsWith('#')) continue;

    const match = text.match(/^(\S+)\s+(\S+)\s*(?:->|→)\s*(\S+)\s+(\S+)\s+([LRS])$/u);
    if (!match) {
      throw programError(line, '规则格式应为「状态 符号 -> 新状态 新符号 L/R/S」。');
    }

    const [, fromState, rawRead, state, rawWrite, rawDirection] = match;
    if (Array.from(rawRead).length !== 1 || Array.from(rawWrite).length !== 1) {
      throw programError(line, '读取和写入的符号必须各为一个 Unicode 字符。');
    }

    const read = normalizeSymbol(rawRead);
    const write = normalizeSymbol(rawWrite);
    const transitions = program.get(fromState) ?? new Map();
    const previous = transitions.get(read);
    if (previous) {
      throw programError(line, `状态 ${fromState} 读取 ${read === '_' ? '□' : read} 的规则重复，首次定义在第 ${previous.line} 行。`);
    }

    transitions.set(read, {
      state,
      write,
      direction: /** @type {'L' | 'R' | 'S'} */ (rawDirection),
      line,
    });
    program.set(fromState, transitions);
  }

  if (program.size === 0) throw programError(1, '请至少填写一条转移规则。');
  return program;
}

/**
 * @typedef {object} MachineOptions
 * @property {Program} program
 * @property {string} [input]
 * @property {'start' | 'center' | 'end'} [headPosition]
 * @property {string} [initialState]
 * @property {string[]} [haltStates]
 */

/** 纸带以初始输入的左端为索引 0，向两侧无限延伸。 */
export class TuringMachine {
  /** @param {MachineOptions} options */
  constructor({ program, input = '', headPosition = 'center', initialState = 'q0', haltStates = ['e'] }) {
    const symbols = Array.from(input.trim(), normalizeSymbol);
    if (symbols.some((symbol) => /\s/u.test(symbol))) {
      throw new Error('初始纸带中不能含空格或换行，请使用 B、_ 或 □ 表示空白。');
    }
    if (!/^\S+$/u.test(initialState)) throw new Error('初始状态不能为空或包含空格。');
    if (haltStates.some((state) => !/^\S+$/u.test(state))) {
      throw new Error('终止状态不能为空或包含空格。');
    }
    if (!['start', 'center', 'end'].includes(headPosition)) {
      throw new Error('读写头位置应为 start、center 或 end。');
    }

    this.program = program;
    /** @type {Map<number, string>} */
    this.tape = new Map();
    symbols.forEach((symbol, index) => {
      if (symbol !== '_') this.tape.set(index, symbol);
    });
    this.state = initialState;
    this.head = headPosition === 'start' ? 0 : headPosition === 'end'
      ? Math.max(0, symbols.length - 1) : Math.floor(symbols.length / 2);
    this.steps = 0;
    this.haltStates = new Set(haltStates);
    /** @type {HaltReason} */
    this.haltReason = null;
    /** @type {ExecutedTransition | null} */
    this.lastTransition = null;
    this.updateHaltReason();
  }

  /** @param {number} [index] */
  read(index = this.head) {
    return this.tape.get(index) ?? '_';
  }

  updateHaltReason() {
    this.haltReason = this.haltStates.has(this.state) ? 'terminal'
      : this.program.get(this.state)?.has(this.read()) ? null : 'missing';
  }

  /** @returns {boolean} 是否实际执行了一条转移。 */
  step() {
    if (this.haltReason !== null) return false;
    const transition = this.program.get(this.state)?.get(this.read());
    if (!transition) {
      this.updateHaltReason();
      return false;
    }

    this.lastTransition = { ...transition, fromState: this.state, read: this.read() };
    if (transition.write === '_') this.tape.delete(this.head);
    else this.tape.set(this.head, transition.write);
    this.head += transition.direction === 'L' ? -1 : transition.direction === 'R' ? 1 : 0;
    this.state = transition.state;
    this.steps += 1;
    this.updateHaltReason();
    return true;
  }

  /** 去除两端空白，保留内部空白的位置。 */
  output() {
    if (this.tape.size === 0) return '';
    let left = Infinity;
    let right = -Infinity;
    for (const index of this.tape.keys()) {
      left = Math.min(left, index);
      right = Math.max(right, index);
    }
    let result = '';
    for (let index = left; index <= right; index += 1) {
      const symbol = this.read(index);
      result += symbol === '_' ? '□' : symbol;
    }
    return result;
  }
}
