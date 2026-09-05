type SentenceLanguage = "zh" | "en";
type SentenceRevealMode = "single" | "cumulative";
type SentenceDriveMode = "auto" | "local" | "page";

type SentenceFieldConfig = {
  text: string;
  lineBreakMarker: string;
  fixedSentenceIndexes?: number[];
  language: SentenceLanguage;
  revealMode: SentenceRevealMode;
  drive: SentenceDriveMode;
  playing: boolean;
  speed: number;
  density: number;
  rows: number;
  columns: number;
  respectReducedMotion: boolean;
};

const PAGE_SCROLL_DURATION = 14;
const LATIN_NOISE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHINESE_NOISE =
  "天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈零一无有虚实光影声像时间序列信号噪点频率边界运动静止秩序意义阅读显现隐藏瞬间循环上下左右内外远近深浅明暗";

function hash(value: number) {
  return Math.abs(Math.sin(value * 91.3458) * 47453.5453) % 1;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSentences(text: string, marker: string) {
  return text
    .split(marker)
    .flatMap((part) => part.split(/\r?\n/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function readConfig(root: HTMLElement): SentenceFieldConfig {
  let fixedSentenceIndexes: number[] | undefined;
  if (root.dataset.fixedSentenceIndexes) {
    try {
      const parsed: unknown = JSON.parse(root.dataset.fixedSentenceIndexes);
      if (Array.isArray(parsed)) fixedSentenceIndexes = parsed.filter((value): value is number => typeof value === "number");
    } catch {
      console.warn("[DynamicSentenceField] fixedSentenceIndexes 不是有效的 JSON 数组。");
    }
  }

  return {
    text: root.dataset.text ?? "",
    lineBreakMarker: root.dataset.lineBreakMarker || "||",
    fixedSentenceIndexes,
    language: root.dataset.language === "en" ? "en" : "zh",
    revealMode: root.dataset.revealMode === "cumulative" ? "cumulative" : "single",
    drive: root.dataset.drive === "local" || root.dataset.drive === "page" ? root.dataset.drive : "auto",
    playing: root.dataset.playing !== "false",
    speed: parseNumber(root.dataset.speed, 1),
    density: parseNumber(root.dataset.density, 8),
    rows: Math.max(1, Math.floor(parseNumber(root.dataset.rows, 40))),
    columns: Math.max(1, Math.floor(parseNumber(root.dataset.columns, 68))),
    respectReducedMotion: root.dataset.respectReducedMotion !== "false",
  };
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function initializeSentenceField(root: HTMLElement) {
  if (root.dataset.sentenceFieldInitialized === "true") return;
  const canvas = root.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas) return;
  root.dataset.sentenceFieldInitialized = "true";

  const config = readConfig(root);
  const sentences = parseSentences(config.text, config.lineBreakMarker);
  const sentenceCharacters = sentences.map((sentence) => Array.from(sentence));
  const requestedIndexes = config.fixedSentenceIndexes ?? sentences.map((_, index) => index);
  const fixedIndexes = [...new Set(requestedIndexes)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < sentences.length,
  );
  const invalidIndexes = requestedIndexes.filter(
    (index) => !Number.isInteger(index) || index < 0 || index >= sentences.length,
  );
  const requiredRows = sentences.length === 0 ? 0 : sentences.length * 3 - 2;
  const longestSentence = Math.max(0, ...sentenceCharacters.map((sentence) => sentence.length));
  const problems: string[] = [];
  if (config.rows < requiredRows) problems.push(`需要至少 ${requiredRows} 行，当前为 ${config.rows} 行`);
  if (config.columns < longestSentence) problems.push(`最长句子需要 ${longestSentence} 列，当前为 ${config.columns} 列`);
  if (invalidIndexes.length) problems.push(`无效的 fixedSentenceIndexes: ${invalidIndexes.join(", ")}`);
  if (!sentences.length) problems.push("没有从 text 中解析出句子，请检查 text 与 lineBreakMarker");
  if (problems.length) {
    console.warn(`[DynamicSentenceField] 输入无法完整排布：${problems.join("；")}。请检查组件输入。`);
  }

  let phase = 0;
  let localTarget = 0;
  let lastTimestamp = performance.now();
  let visible = true;
  let foreground = getComputedStyle(root).color;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const draw = () => {
    const fitted = fitCanvas(canvas);
    if (!fitted) return;
    const { context, width, height } = fitted;
    context.clearRect(0, 0, width, height);
    if (!sentences.length || width <= 0 || height <= 0) return;

    const cellWidth = width / config.columns;
    const cellHeight = height / config.rows;
    const cell = Math.min(cellWidth, cellHeight);
    const fontScale = 0.48 + Math.min(12, Math.max(2, config.density)) * 0.028;
    const tick = Math.floor(phase * 9);
    const activeSlot = fixedIndexes.length
      ? Math.floor(positiveModulo(phase / 2.5, fixedIndexes.length))
      : -1;
    const visibleIndexes = new Set<number>();
    if (activeSlot >= 0) {
      if (config.revealMode === "single") visibleIndexes.add(fixedIndexes[activeSlot]);
      else fixedIndexes.slice(0, activeSlot + 1).forEach((index) => visibleIndexes.add(index));
    }

    const groupHeight = sentences.length * 3 - 2;
    const firstSentenceRow = Math.floor((config.rows - groupHeight) / 2);
    const sentenceByRow = new Map<number, number>();
    sentences.forEach((_, index) => sentenceByRow.set(firstSentenceRow + index * 3, index));
    const noiseCharacters = config.language === "zh" ? CHINESE_NOISE : LATIN_NOISE;

    context.font = `500 ${Math.max(7, Math.floor(cell * fontScale))}px ui-monospace, SFMono-Regular, Consolas, "Microsoft YaHei", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = foreground;

    for (let row = 0; row < config.rows; row += 1) {
      const sentenceIndex = sentenceByRow.get(row);
      const phrase = sentenceIndex === undefined ? undefined : sentenceCharacters[sentenceIndex];
      const phraseStart = phrase ? Math.floor((config.columns - phrase.length) / 2) : 0;
      const revealed = sentenceIndex !== undefined && visibleIndexes.has(sentenceIndex);

      for (let column = 0; column < config.columns; column += 1) {
        const phraseOffset = column - phraseStart;
        const isFixedCharacter = Boolean(revealed && phrase && phraseOffset >= 0 && phraseOffset < phrase.length);
        const seed = column * 89 + row * 137 + (isFixedCharacter ? 0 : tick * 173);
        const character = isFixedCharacter
          ? phrase?.[phraseOffset] ?? ""
          : noiseCharacters[Math.floor(hash(seed) * noiseCharacters.length)];
        context.globalAlpha = isFixedCharacter ? 1 : 0.48 + hash(seed + 5) * 0.38;
        context.fillText(character, column * cellWidth + cellWidth / 2, row * cellHeight + cellHeight / 2);
      }
    }
    context.globalAlpha = 1;
  };

  const updatePagePhase = () => {
    if (config.drive !== "page") return;
    const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    phase = (window.scrollY / range) * PAGE_SCROLL_DURATION * config.speed;
  };

  const animate = (timestamp: number) => {
    const elapsed = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;
    const reduceAutoMotion = config.respectReducedMotion && motionQuery.matches;

    if (config.drive === "auto" && config.playing && !reduceAutoMotion) {
      phase = (phase + elapsed * config.speed) % 24;
    } else if (config.drive === "local") {
      const distance = localTarget - phase;
      if (Math.abs(distance) > 0.0005) phase += distance * 0.115;
    }

    if (visible) draw();
    requestAnimationFrame(animate);
  };

  const handleWheel = (event: WheelEvent) => {
    if (config.drive !== "local") return;
    event.preventDefault();
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 18
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 360
          : 1;
    const delta = Math.max(-1.8, Math.min(1.8, event.deltaY * unit * 0.009 * config.speed));
    localTarget += delta;
  };

  root.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("scroll", updatePagePhase, { passive: true });
  motionQuery.addEventListener("change", draw);
  new MutationObserver(() => {
    foreground = getComputedStyle(root).color;
    draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme"] });
  new ResizeObserver(draw).observe(root);
  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) {
      lastTimestamp = performance.now();
      draw();
    }
  }).observe(root);

  updatePagePhase();
  draw();
  requestAnimationFrame(animate);

  // 供页面脚本在需要时把组件恢复到初始相位。
  root.addEventListener("dynamic-sentence-field:reset", () => {
    phase = 0;
    localTarget = 0;
    lastTimestamp = performance.now();
    draw();
  });
}

document.querySelectorAll<HTMLElement>("[data-dynamic-sentence-field]").forEach(initializeSentenceField);
