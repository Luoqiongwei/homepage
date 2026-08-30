const COLS = 74;
const ROWS = 48;
const COUNT = COLS * ROWS;
const INF = 9999;
const BURN_BUFFER_SCALE = .62;

type Point = { x: number; y: number };
type EdgeName = 't' | 'r' | 'b' | 'l';
type Segment = [Point, Point];
type PackedContourFrame = { points: Float32Array; offsets: Uint32Array };
type ContourFrame = Point[][] | PackedContourFrame;
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  phase: number;
  kind: 'spark' | 'ash';
};
type Field = {
  cells: Uint8Array;
  ages: Uint16Array;
  fromDistance: Float32Array;
  toDistance: Float32Array;
  morphStarted: number;
  morphDuration: number;
  generationStarted: number;
  generation: number;
  arcCount: number;
  morphFrames: ContourFrame[];
  morphId: number;
  cellVersion: number;
  seed: number;
  clock: number;
};

type RenderCache = {
  width: number;
  height: number;
  dpr: number;
  cssWidth: number;
  cssHeight: number;
  cell: number;
  ox: number;
  oy: number;
  cellVersion: number;
  seed: number;
  paperLayer: HTMLCanvasElement | null;
  cellLayer: HTMLCanvasElement | null;
  arcMorphId: number;
  arcFrameIndex: number;
  arcPath: Path2D | null;
  arcLayer: HTMLCanvasElement | null;
  burnLayer: HTMLCanvasElement | null;
  lastBurnClock: number;
  lastBurnMorphId: number;
  lastBurnFrameIndex: number;
  particles: Particle[];
  nextBurstClock: number;
  effectState: number;
  frameTimeEma: number;
};

type DrawEffects = {
  burnMemory: boolean;
  particles: boolean;
  elapsed: number;
  active: boolean;
};

type PreparedGeneration = {
  cells: Uint8Array;
  ages: Uint16Array;
  fromDistance: Float32Array;
  toDistance: Float32Array;
  morphFrames: ContourFrame[];
  arcCount: number;
};

type GenerationWorkerResponse = {
  id: number;
  steps: PreparedGeneration[];
  append: boolean;
  complete: boolean;
};

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function indexAt(x: number, y: number) {
  return ((y + ROWS) % ROWS) * COLS + ((x + COLS) % COLS);
}

function distanceTo(cells: Uint8Array, target: 0 | 1) {
  const distance = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) distance[i] = cells[i] === target ? 0 : INF;
  const diagonal = Math.SQRT2;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      let value = distance[i];
      if (x > 0) value = Math.min(value, distance[i - 1] + 1);
      if (y > 0) value = Math.min(value, distance[i - COLS] + 1);
      if (x > 0 && y > 0) value = Math.min(value, distance[i - COLS - 1] + diagonal);
      if (x < COLS - 1 && y > 0) value = Math.min(value, distance[i - COLS + 1] + diagonal);
      distance[i] = value;
    }
  }
  for (let y = ROWS - 1; y >= 0; y--) {
    for (let x = COLS - 1; x >= 0; x--) {
      const i = y * COLS + x;
      let value = distance[i];
      if (x < COLS - 1) value = Math.min(value, distance[i + 1] + 1);
      if (y < ROWS - 1) value = Math.min(value, distance[i + COLS] + 1);
      if (x < COLS - 1 && y < ROWS - 1) value = Math.min(value, distance[i + COLS + 1] + diagonal);
      if (x > 0 && y < ROWS - 1) value = Math.min(value, distance[i + COLS - 1] + diagonal);
      distance[i] = value;
    }
  }
  return distance;
}

function signedDistance(cells: Uint8Array) {
  const toAlive = distanceTo(cells, 1);
  const toDead = distanceTo(cells, 0);
  const result = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) result[i] = toDead[i] - toAlive[i];
  return result;
}

function morphLinear(field: Field) {
  return Math.max(0, Math.min(1, (field.clock - field.morphStarted) / Math.max(1, field.morphDuration)));
}

function flowEase(linear: number) {
  // A softened linear curve whose endpoint velocity never falls to zero.
  return linear * (.82 + .18 * (3 * linear - 2 * linear * linear));
}

function currentDistance(field: Field) {
  return distanceAtClock(field, field.clock);
}

function distanceAtClock(field: Field, clock: number) {
  const linear = Math.max(0, Math.min(1, (clock - field.morphStarted) / Math.max(1, field.morphDuration)));
  const progress = flowEase(linear);
  const result = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) result[i] = field.fromDistance[i] * (1 - progress) + field.toDistance[i] * progress;
  return result;
}

function interpolateEdge(a: number, b: number) {
  const denominator = a - b;
  if (Math.abs(denominator) < .00001) return .5;
  return Math.max(.04, Math.min(.96, a / denominator));
}

function marchingSegments(values: Float32Array): Segment[] {
  const segments: Segment[] = [];
  const cases: Record<number, [EdgeName, EdgeName][]> = {
    1: [['l', 't']], 2: [['t', 'r']], 3: [['l', 'r']], 4: [['r', 'b']],
    // Black is eight-connected: diagonal black corners share a slanted bridge.
    5: [['t', 'r'], ['b', 'l']], 6: [['t', 'b']], 7: [['l', 'b']],
    8: [['b', 'l']], 9: [['t', 'b']], 10: [['l', 't'], ['r', 'b']],
    11: [['r', 'b']], 12: [['l', 'r']], 13: [['t', 'r']], 14: [['l', 't']],
  };

  for (let y = 0; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS - 1; x++) {
      const tl = values[y * COLS + x];
      const tr = values[y * COLS + x + 1];
      const br = values[(y + 1) * COLS + x + 1];
      const bl = values[(y + 1) * COLS + x];
      const code = (tl > 0 ? 1 : 0) | (tr > 0 ? 2 : 0) | (br > 0 ? 4 : 0) | (bl > 0 ? 8 : 0);
      const topology = cases[code];
      if (!topology) continue;
      const points: Record<EdgeName, Point> = {
        t: { x: x + interpolateEdge(tl, tr), y },
        r: { x: x + 1, y: y + interpolateEdge(tr, br) },
        b: { x: x + interpolateEdge(bl, br), y: y + 1 },
        l: { x, y: y + interpolateEdge(tl, bl) },
      };
      for (const [a, b] of topology) segments.push([points[a], points[b]]);
    }
  }
  return segments;
}

function pointKey(point: Point) {
  return Math.round(point.x * 10000) * 1000000 + Math.round(point.y * 10000);
}

function stitchSegments(segments: Segment[]) {
  const attached = new Map<number, number[]>();
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    for (let endpoint = 0; endpoint < 2; endpoint++) {
      const point = segment[endpoint];
      const key = pointKey(point);
      const connections = attached.get(key);
      if (connections) connections.push(index);
      else attached.set(key, [index]);
    }
  }
  const visited = new Uint8Array(segments.length);
  const paths: Point[][] = [];
  for (let seed = 0; seed < segments.length; seed++) {
    if (visited[seed]) continue;
    const segment = segments[seed];
    const start = (attached.get(pointKey(segment[0]))?.length ?? 0) === 1 ? segment[0] : segment[1];
    const points = [start];
    let cursor = pointKey(start);
    let current = seed;
    while (!visited[current]) {
      visited[current] = 1;
      const candidate = segments[current];
      const next = pointKey(candidate[0]) === cursor ? candidate[1] : candidate[0];
      points.push(next);
      cursor = pointKey(next);
      const connections = attached.get(cursor);
      let onward = -1;
      if (connections) {
        for (const index of connections) {
          if (!visited[index]) {
            onward = index;
            break;
          }
        }
      }
      if (onward < 0) break;
      current = onward;
    }
    if (points.length > 2) paths.push(points);
  }
  return paths;
}

function contours(values: Float32Array) {
  return stitchSegments(marchingSegments(values));
}

function isPackedFrame(frame: ContourFrame): frame is PackedContourFrame {
  return !Array.isArray(frame);
}

function contourPathCount(frame: ContourFrame) {
  return isPackedFrame(frame) ? Math.max(0, frame.offsets.length - 1) : frame.length;
}

function contourPathLength(frame: ContourFrame, pathIndex: number) {
  if (!isPackedFrame(frame)) return frame[pathIndex]?.length ?? 0;
  return (frame.offsets[pathIndex + 1] - frame.offsets[pathIndex]) / 2;
}

function contourPointX(frame: ContourFrame, pathIndex: number, pointIndex: number) {
  if (!isPackedFrame(frame)) return frame[pathIndex][pointIndex].x;
  return frame.points[frame.offsets[pathIndex] + pointIndex * 2];
}

function contourPointY(frame: ContourFrame, pathIndex: number, pointIndex: number) {
  if (!isPackedFrame(frame)) return frame[pathIndex][pointIndex].y;
  return frame.points[frame.offsets[pathIndex] + pointIndex * 2 + 1];
}

function contourPoint(frame: ContourFrame, pathIndex: number, pointIndex: number): Point {
  return {
    x: contourPointX(frame, pathIndex, pointIndex),
    y: contourPointY(frame, pathIndex, pointIndex),
  };
}

function prepareMorphFrames(from: Float32Array, to: Float32Array, frameCount = 32) {
  const frames: ContourFrame[] = [];
  const values = new Float32Array(COUNT);
  for (let frame = 0; frame < frameCount; frame++) {
    const linear = frame / Math.max(1, frameCount - 1);
    const progress = flowEase(linear);
    for (let i = 0; i < COUNT; i++) values[i] = from[i] * (1 - progress) + to[i] * progress;
    frames.push(contours(values));
  }
  return frames;
}

function makeField(density: number, seed = Math.floor(Math.random() * 999999)): Field {
  const random = mulberry32(seed);
  const cells = new Uint8Array(COUNT);
  const ages = new Uint16Array(COUNT);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const edge = Math.min(x, y, COLS - x - 1, ROWS - y - 1);
      const grain = Math.sin(x * .31 + y * .13) * .035;
      cells[y * COLS + x] = random() < density + grain - (edge < 2 ? .08 : 0) ? 1 : 0;
    }
  }
  const distance = signedDistance(cells);
  const initialContours = contours(distance);
  return {
    cells,
    ages,
    fromDistance: distance,
    toDistance: new Float32Array(distance),
    morphStarted: 0,
    morphDuration: 900,
    generationStarted: 0,
    generation: 0,
    arcCount: initialContours.length,
    morphFrames: [initialContours],
    morphId: 0,
    cellVersion: 0,
    seed,
    clock: 0,
  };
}

function livingNeighbors(cells: Uint8Array, x: number, y: number) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) count += cells[indexAt(x + dx, y + dy)];
    }
  }
  return count;
}

function stepField(field: Field, duration: number) {
  const next = new Uint8Array(COUNT);
  const nextAges = new Uint16Array(COUNT);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const neighbors = livingNeighbors(field.cells, x, y);
      const alive = field.cells[i] === 1;
      const nextAlive = (alive && (neighbors === 2 || neighbors === 3)) || (!alive && neighbors === 3);
      next[i] = nextAlive ? 1 : 0;
      nextAges[i] = nextAlive ? (alive ? Math.min(65535, field.ages[i] + 1) : 1) : 0;
    }
  }
  field.fromDistance = currentDistance(field);
  field.toDistance = signedDistance(next);
  field.morphStarted = field.clock;
  // Slight overlap means the next generation begins before the envelope can dwell on its target.
  field.morphDuration = duration * 1.04;
  field.generationStarted = field.clock;
  field.cells = next;
  field.ages = nextAges;
  field.generation += 1;
  field.morphFrames = prepareMorphFrames(field.fromDistance, field.toDistance);
  field.morphId += 1;
  field.cellVersion += 1;
  field.arcCount = contourPathCount(field.morphFrames[field.morphFrames.length - 1] ?? []);
}

function applyPreparedGeneration(field: Field, prepared: PreparedGeneration, duration: number) {
  field.fromDistance = prepared.fromDistance;
  field.toDistance = prepared.toDistance;
  field.morphStarted = field.clock;
  field.morphDuration = duration * 1.04;
  field.generationStarted = field.clock;
  field.cells = prepared.cells;
  field.ages = prepared.ages;
  field.generation += 1;
  field.morphFrames = prepared.morphFrames;
  field.morphId += 1;
  field.cellVersion += 1;
  field.arcCount = prepared.arcCount;
}

function gridMetrics(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const cell = Math.min(rect.width / COLS, rect.height / ROWS);
  return { rect, cell, ox: (rect.width - cell * COLS) / 2, oy: (rect.height - cell * ROWS) / 2 };
}

function updateGridMetrics(cache: RenderCache, width: number, height: number) {
  cache.cssWidth = width;
  cache.cssHeight = height;
  cache.cell = Math.min(width / COLS, height / ROWS);
  cache.ox = (width - cache.cell * COLS) / 2;
  cache.oy = (height - cache.cell * ROWS) / 2;
}

function compileArcPath(paths: ContourFrame, cell: number, ox: number, oy: number) {
  const result = new Path2D();
  const locate = (pathIndex: number, index: number, length: number) => {
    const safe = Math.max(0, Math.min(length - 1, index));
    const beforeIndex = Math.max(0, safe - 1);
    const afterIndex = Math.min(length - 1, safe + 1);
    const pointX = contourPointX(paths, pathIndex, safe);
    const pointY = contourPointY(paths, pathIndex, safe);
    const tx = contourPointX(paths, pathIndex, afterIndex) - contourPointX(paths, pathIndex, beforeIndex);
    const ty = contourPointY(paths, pathIndex, afterIndex) - contourPointY(paths, pathIndex, beforeIndex);
    const tangentLength = Math.hypot(tx, ty) || 1;
    const irregularity = Math.sin(safe * .61 + pathIndex * 1.79) * cell * .025;
    return {
      x: ox + (pointX + .5) * cell - (ty / tangentLength) * irregularity,
      y: oy + (pointY + .5) * cell + (tx / tangentLength) * irregularity,
    };
  };

  const pathCount = contourPathCount(paths);
  for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
    const length = contourPathLength(paths, pathIndex);
    if (length < 2) continue;
    const start = locate(pathIndex, 0, length);
    result.moveTo(start.x, start.y);
    for (let i = 0; i < length - 1; i++) {
      const p0 = locate(pathIndex, i - 1, length);
      const p1 = locate(pathIndex, i, length);
      const p2 = locate(pathIndex, i + 1, length);
      const p3 = locate(pathIndex, i + 2, length);
      result.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6,
        p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6,
        p2.y - (p3.y - p1.y) / 6,
        p2.x,
        p2.y,
      );
    }
  }
  return result;
}

function rebuildArcLayer(
  cache: RenderCache,
  path: Path2D,
  width: number,
  height: number,
  dpr: number,
  cell: number,
  ox: number,
  oy: number,
) {
  const layer = cache.arcLayer ?? document.createElement('canvas');
  if (layer.width !== width || layer.height !== height) {
    layer.width = width;
    layer.height = height;
  }
  const ctx = layer.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(116, 25, 14, .58)';
  ctx.lineWidth = Math.max(1.2, cell * .235);
  ctx.shadowBlur = 3.4;
  ctx.shadowColor = 'rgba(205, 44, 17, .5)';
  ctx.stroke(path);

  const flame = ctx.createLinearGradient(ox, oy + cell * ROWS, ox + cell * COLS, oy);
  flame.addColorStop(0, 'rgba(188, 48, 23, .82)');
  flame.addColorStop(.42, 'rgba(248, 105, 33, .9)');
  flame.addColorStop(.72, 'rgba(224, 64, 22, .86)');
  flame.addColorStop(1, 'rgba(162, 35, 19, .78)');
  ctx.strokeStyle = flame;
  ctx.lineWidth = Math.max(.62, cell * .095);
  ctx.shadowBlur = 1.5;
  ctx.stroke(path);

  ctx.strokeStyle = 'rgba(255, 206, 116, .76)';
  ctx.lineWidth = Math.max(.34, cell * .035);
  ctx.shadowBlur = .7;
  ctx.stroke(path);
  ctx.restore();
  cache.arcLayer = layer;
}

function effectRandom(cache: RenderCache) {
  let state = cache.effectState || 0x6d2b79f5;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  cache.effectState = state >>> 0;
  return cache.effectState / 4294967296;
}

function ensureBurnLayer(cache: RenderCache, width: number, height: number, dpr: number, clock: number) {
  const burnWidth = Math.max(1, Math.floor(width * BURN_BUFFER_SCALE));
  const burnHeight = Math.max(1, Math.floor(height * BURN_BUFFER_SCALE));
  if (!cache.burnLayer || cache.burnLayer.width !== burnWidth || cache.burnLayer.height !== burnHeight) {
    const layer = document.createElement('canvas');
    layer.width = burnWidth;
    layer.height = burnHeight;
    cache.burnLayer = layer;
    cache.lastBurnClock = clock;
  }
  const context = cache.burnLayer.getContext('2d');
  const burnDpr = dpr * BURN_BUFFER_SCALE;
  context?.setTransform(burnDpr, 0, 0, burnDpr, 0, 0);
  return context;
}

function updateBurnMemory(
  cache: RenderCache,
  path: Path2D,
  paths: ContourFrame,
  field: Field,
  width: number,
  height: number,
  dpr: number,
  cell: number,
  ox: number,
  oy: number,
  frameIndex: number,
) {
  const ctx = ensureBurnLayer(cache, width, height, dpr, field.clock);
  if (!ctx) return;
  const elapsed = Math.max(0, field.clock - cache.lastBurnClock);
  const interval = cache.frameTimeEma > 24 ? 112 : 72;
  if (elapsed < interval) return;
  cache.lastBurnClock = field.clock;
  const cssWidth = width / dpr;
  const cssHeight = height / dpr;

  // A transparent stain layer: old marks are erased exponentially, revealing fresh paper beneath.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(.055, 1 - Math.exp(-elapsed / 8200))})`;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.restore();

  const repeatedFrame = cache.lastBurnMorphId === field.morphId && cache.lastBurnFrameIndex === frameIndex;
  cache.lastBurnMorphId = field.morphId;
  cache.lastBurnFrameIndex = frameIndex;
  if (repeatedFrame) return;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(80, 35, 17, .032)';
  ctx.lineWidth = Math.max(2.1, cell * .58);
  ctx.shadowBlur = Math.min(4, cell * .24);
  ctx.shadowColor = 'rgba(104, 42, 16, .11)';
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(37, 24, 16, .038)';
  ctx.lineWidth = Math.max(.7, cell * .13);
  ctx.stroke(path);

  // Sparse soot pores keep the memory organic without turning it into a particle field.
  const pathCount = contourPathCount(paths);
  if (pathCount && effectRandom(cache) < .58) {
    const candidates: number[] = [];
    for (let index = 0; index < pathCount; index++) {
      if (contourPathLength(paths, index) > 8) candidates.push(index);
    }
    const selected = candidates[Math.floor(effectRandom(cache) * candidates.length)];
    if (selected !== undefined) {
      const selectedLength = contourPathLength(paths, selected);
      const point = contourPoint(paths, selected, Math.floor(effectRandom(cache) * selectedLength));
      ctx.fillStyle = `rgba(44, 28, 18, ${.035 + effectRandom(cache) * .045})`;
      ctx.beginPath();
      ctx.arc(
        ox + (point.x + .5) * cell,
        oy + (point.y + .5) * cell,
        .35 + effectRandom(cache) * Math.max(.7, cell * .1),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

function spawnParticleBurst(cache: RenderCache, paths: ContourFrame, field: Field, cell: number, ox: number, oy: number) {
  if (field.clock < cache.nextBurstClock) return;
  cache.nextBurstClock = field.clock + 620 + effectRandom(cache) * 880;
  const candidates: number[] = [];
  for (let index = 0; index < contourPathCount(paths); index++) {
    if (contourPathLength(paths, index) > 11 && ((index * 7 + field.generation) % 5 < 2)) candidates.push(index);
  }
  const selected = candidates[Math.floor(effectRandom(cache) * candidates.length)];
  if (selected === undefined) return;
  const selectedLength = contourPathLength(paths, selected);
  const pointIndex = 1 + Math.floor(effectRandom(cache) * Math.max(1, selectedLength - 2));
  const point = contourPoint(paths, selected, Math.min(selectedLength - 1, pointIndex));
  const before = contourPoint(paths, selected, Math.max(0, pointIndex - 1));
  const after = contourPoint(paths, selected, Math.min(selectedLength - 1, pointIndex + 1));
  const tx = after.x - before.x;
  const ty = after.y - before.y;
  const length = Math.hypot(tx, ty) || 1;
  const nx = -ty / length;
  const ny = tx / length;
  const baseX = ox + (point.x + .5) * cell;
  const baseY = oy + (point.y + .5) * cell;
  const budget = cache.frameTimeEma > 28 ? 8 : cache.frameTimeEma > 22 ? 16 : 28;
  const burstSize = 2 + Math.floor(effectRandom(cache) * 3);

  for (let i = 0; i < burstSize && cache.particles.length < budget; i++) {
    const kind = effectRandom(cache) < .7 ? 'spark' : 'ash';
    const side = effectRandom(cache) < .5 ? -1 : 1;
    const tangent = (effectRandom(cache) - .5) * (kind === 'spark' ? .055 : .018) * cell;
    const normal = side * (.018 + effectRandom(cache) * .034) * cell;
    const maxLife = kind === 'spark' ? 360 + effectRandom(cache) * 420 : 900 + effectRandom(cache) * 900;
    cache.particles.push({
      x: baseX + nx * (effectRandom(cache) - .5) * cell * .35,
      y: baseY + ny * (effectRandom(cache) - .5) * cell * .35,
      vx: (tx / length) * tangent + nx * normal,
      vy: (ty / length) * tangent + ny * normal - (kind === 'spark' ? .025 : .008) * cell,
      life: maxLife,
      maxLife,
      size: kind === 'spark' ? .45 + effectRandom(cache) * 1.15 : .55 + effectRandom(cache) * 1.35,
      phase: effectRandom(cache) * Math.PI * 2,
      kind,
    });
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, cache: RenderCache, elapsed: number, paths: ContourFrame, field: Field, cell: number, ox: number, oy: number) {
  if (elapsed > 0) spawnParticleBurst(cache, paths, field, cell, ox, oy);
  const dt = Math.min(34, Math.max(0, elapsed));
  let writeIndex = 0;
  for (let index = 0; index < cache.particles.length; index++) {
    const particle = cache.particles[index];
    if (dt > 0) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += (particle.kind === 'spark' ? .00022 : .000035) * dt;
      if (particle.kind === 'ash') particle.vx += Math.sin(field.clock * .003 + particle.phase) * .000018 * dt;
    }
    if (particle.life <= 0) continue;
    cache.particles[writeIndex++] = particle;
    const progress = particle.life / particle.maxLife;
    ctx.save();
    if (particle.kind === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, progress * 1.65);
      ctx.strokeStyle = progress > .55 ? '#ffe4a1' : '#ee6d25';
      ctx.lineWidth = particle.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * 13, particle.y - particle.vy * 13);
      ctx.stroke();
    } else {
      ctx.globalAlpha = Math.sin(Math.min(1, progress) * Math.PI) * .58;
      ctx.fillStyle = '#493a2d';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (.7 + (1 - progress) * .45), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  cache.particles.length = writeIndex;
}

function rebuildPaperLayer(cache: RenderCache, field: Field, width: number, height: number, dpr: number) {
  const paperLayer = cache.paperLayer ?? document.createElement('canvas');
  paperLayer.width = width;
  paperLayer.height = height;
  const ctx = paperLayer.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssWidth = width / dpr;
  const cssHeight = height / dpr;
  const paper = ctx.createRadialGradient(cssWidth * .46, cssHeight * .4, 10, cssWidth * .5, cssHeight * .5, cssWidth * .72);
  paper.addColorStop(0, '#dfd1b1');
  paper.addColorStop(.68, '#d2c19f');
  paper.addColorStop(1, '#bda984');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = 'rgba(70, 51, 33, .07)';
  ctx.lineWidth = .48;
  for (let n = 0; n < 62; n++) {
    const y = (((n * 43 + field.seed) % 101) / 101) * cssHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(cssWidth * .28, y + Math.sin(n * 1.7) * 2.4, cssWidth * .72, y - Math.cos(n * 2.2) * 2, cssWidth, y + Math.sin(n) * 1.2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(64, 47, 31, .055)';
  for (let n = 0; n < 130; n++) {
    const x = ((n * 67 + field.seed * 3) % 997) / 997 * cssWidth;
    const y = ((n * 149 + field.seed) % 991) / 991 * cssHeight;
    ctx.fillRect(x, y, .45 + (n % 3) * .18, .35);
  }

  cache.paperLayer = paperLayer;
  cache.seed = field.seed;
}

function rebuildCellLayer(cache: RenderCache, field: Field, width: number, height: number, dpr: number, cell: number, ox: number, oy: number) {
  const cellLayer = cache.cellLayer ?? document.createElement('canvas');
  cellLayer.width = width;
  cellLayer.height = height;
  const ctx = cellLayer.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssWidth = width / dpr;
  const cssHeight = height / dpr;

  const gap = cell > 7 ? .72 : .45;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const px = ox + x * cell;
      const py = oy + y * cell;
      if (field.cells[i]) {
        const ageTone = Math.min(10, field.ages[i]);
        const base = 43 - ageTone;
        ctx.fillStyle = `rgb(${base}, ${base}, ${Math.max(28, base - 5)})`;
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#d8c9aa' : '#d4c5a7';
      }
      ctx.fillRect(px + gap * .5, py + gap * .5, Math.max(.5, cell - gap), Math.max(.5, cell - gap));
    }
  }

  const vignette = ctx.createRadialGradient(cssWidth / 2, cssHeight / 2, cssHeight * .28, cssWidth / 2, cssHeight / 2, Math.max(cssWidth, cssHeight) * .69);
  vignette.addColorStop(0, 'rgba(45, 31, 19, 0)');
  vignette.addColorStop(1, 'rgba(45, 31, 19, .16)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  cache.cellLayer = cellLayer;
  cache.cellVersion = field.cellVersion;
}

function drawField(canvas: HTMLCanvasElement, field: Field, cache: RenderCache, effects: DrawEffects) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (cache.cssWidth <= 0 || cache.cssHeight <= 0) {
    const rect = canvas.getBoundingClientRect();
    updateGridMetrics(cache, rect.width, rect.height);
  }
  const { cssWidth, cssHeight, cell, ox, oy } = cache;
  if (cssWidth <= 0 || cssHeight <= 0) return;
  const pixelArea = cssWidth * cssHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, pixelArea > 520000 ? 1.25 : 1.4);
  const width = Math.max(1, Math.floor(cssWidth * dpr));
  const height = Math.max(1, Math.floor(cssHeight * dpr));
  const resized = canvas.width !== width || canvas.height !== height || cache.dpr !== dpr;
  if (resized) {
    canvas.width = width;
    canvas.height = height;
    cache.width = width;
    cache.height = height;
    cache.dpr = dpr;
    cache.arcPath = null;
    cache.arcLayer = null;
    cache.burnLayer = null;
    cache.paperLayer = null;
    cache.cellLayer = null;
  }
  if (resized || !cache.paperLayer || cache.seed !== field.seed) rebuildPaperLayer(cache, field, width, height, dpr);
  if (resized || !cache.cellLayer || cache.cellVersion !== field.cellVersion) rebuildCellLayer(cache, field, width, height, dpr, cell, ox, oy);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (cache.paperLayer) ctx.drawImage(cache.paperLayer, 0, 0);
  if (cache.cellLayer) ctx.drawImage(cache.cellLayer, 0, 0);

  const frameIndex = Math.min(
    field.morphFrames.length - 1,
    Math.max(0, Math.round(morphLinear(field) * Math.max(0, field.morphFrames.length - 1))),
  );
  let arcChanged = false;
  if (!cache.arcPath || cache.arcMorphId !== field.morphId || cache.arcFrameIndex !== frameIndex) {
    cache.arcPath = compileArcPath(field.morphFrames[frameIndex] ?? [], cell, ox, oy);
    cache.arcMorphId = field.morphId;
    cache.arcFrameIndex = frameIndex;
    arcChanged = true;
  }

  const path = cache.arcPath;
  const paths = field.morphFrames[frameIndex] ?? [];
  if (path && (arcChanged || !cache.arcLayer)) rebuildArcLayer(cache, path, width, height, dpr, cell, ox, oy);
  cache.frameTimeEma += (effects.elapsed - cache.frameTimeEma) * .045;
  if (path && effects.burnMemory && effects.active) {
    updateBurnMemory(cache, path, paths, field, width, height, dpr, cell, ox, oy, frameIndex);
  }
  if (effects.burnMemory && cache.burnLayer) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = .9;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cache.burnLayer, 0, 0, width, height);
    ctx.restore();
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (path) {
    const flicker = .94 + Math.sin(field.clock * .0067) * .045 + Math.sin(field.clock * .0021) * .025;
    if (cache.arcLayer) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flicker;
      ctx.drawImage(cache.arcLayer, 0, 0);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = flicker;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([cell * 2.2, cell * 1.15]);
    ctx.lineDashOffset = -field.clock * .012;
    ctx.strokeStyle = 'rgba(255, 239, 185, .52)';
    ctx.lineWidth = Math.max(.3, cell * .028);
    ctx.shadowBlur = .4;
    ctx.stroke(path);
    ctx.restore();
  }

  if (effects.particles) {
    drawParticles(ctx, cache, effects.active ? effects.elapsed : 0, paths, field, cell, ox, oy);
  }

  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(50, 41, 31, .28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox - .5, oy - .5, cell * COLS + 1, cell * ROWS + 1);
}

function createRenderCache(): RenderCache {
  return {
    width: 0,
    height: 0,
    dpr: 0,
    cssWidth: 0,
    cssHeight: 0,
    cell: 0,
    ox: 0,
    oy: 0,
    cellVersion: -1,
    seed: -1,
    paperLayer: null,
    cellLayer: null,
    arcMorphId: -1,
    arcFrameIndex: -1,
    arcPath: null,
    arcLayer: null,
    burnLayer: null,
    lastBurnClock: 0,
    lastBurnMorphId: -1,
    lastBurnFrameIndex: -1,
    particles: [],
    nextBurstClock: 0,
    effectState: 0,
    frameTimeEma: 16.7,
  };
}

function morphFrameBudget(field: Field) {
  if (field.generation < 8) return 24;
  if (field.generation < 20) return 28;
  let alive = 0;
  for (const cell of field.cells) alive += cell;
  const density = alive / COUNT;
  if (density > .28) return 32;
  if (density > .16) return 40;
  if (density > .09) return 48;
  return 56;
}

function initialize(canvas: HTMLCanvasElement) {
  if (canvas.dataset.smolderReady === 'true') return;
  canvas.dataset.smolderReady = 'true';

  const density = Math.max(.05, Math.min(.9, Number(canvas.dataset.density ?? 43) / 100));
  const speed = Math.max(1, Math.min(8, Number(canvas.dataset.speed ?? 6)));
  const paused = canvas.dataset.paused === 'true';
  const interactive = canvas.dataset.interactive === 'true';
  const respectReducedMotion = canvas.dataset.reducedMotion !== 'false';
  const burnMemory = canvas.dataset.burnMemory === 'true';
  const particles = canvas.dataset.particles === 'true';
  const parsedSeed = Number(canvas.dataset.seed);
  const seed = Number.isFinite(parsedSeed) && canvas.dataset.seed !== ''
    ? parsedSeed
    : Math.floor(Math.random() * 999999);
  const field = makeField(density, seed);
  const cache = createRenderCache();
  cache.effectState = seed ^ 0x45d9f3b;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  let visible = true;
  let needsDraw = true;
  let destroyed = false;

  let generationWorker: Worker | null = null;
  let workerFailed = false;
  try {
    generationWorker = new Worker(new URL('./SmolderLifeWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerFailed = true;
  }

  let requestSerial = 0;
  let activeRequestId = 0;
  let workerBusy = false;
  let pipelineInterval = 0;
  let preparedGenerations: PreparedGeneration[] = [];

  const resetGenerationPipeline = () => {
    activeRequestId = ++requestSerial;
    workerBusy = false;
    pipelineInterval = 0;
    preparedGenerations = [];
  };

  if (generationWorker) {
    generationWorker.onmessage = (event: MessageEvent<GenerationWorkerResponse>) => {
      if (event.data.id !== activeRequestId) return;
      if (event.data.append) preparedGenerations.push(...event.data.steps);
      else preparedGenerations = event.data.steps;
      workerBusy = !event.data.complete;
    };
    generationWorker.onerror = () => {
      workerFailed = true;
      resetGenerationPipeline();
    };
  }

  const requestDraw = () => {
    cache.arcPath = null;
    cache.arcLayer = null;
    cache.paperLayer = null;
    cache.cellLayer = null;
    needsDraw = true;
  };

  const updateMotion = () => {
    reducedMotion = motionQuery.matches;
    needsDraw = true;
  };
  motionQuery.addEventListener?.('change', updateMotion);

  const intersectionObserver = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) needsDraw = true;
      }, { rootMargin: '120px' });
  intersectionObserver?.observe(canvas);

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(([entry]) => {
        updateGridMetrics(cache, entry.contentRect.width, entry.contentRect.height);
        cache.arcPath = null;
        cache.arcLayer = null;
        cache.paperLayer = null;
        cache.cellLayer = null;
        cache.burnLayer = null;
        needsDraw = true;
      });
  resizeObserver?.observe(canvas);

  document.addEventListener('visibilitychange', requestDraw);

  if (interactive) {
    canvas.addEventListener('pointerdown', (event) => {
      const { rect, cell, ox, oy } = gridMetrics(canvas);
      const x = Math.floor((event.clientX - rect.left - ox) / cell);
      const y = Math.floor((event.clientY - rect.top - oy) / cell);
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
      field.fromDistance = currentDistance(field);
      const index = y * COLS + x;
      field.cells[index] = field.cells[index] ? 0 : 1;
      field.ages[index] = field.cells[index] ? 1 : 0;
      field.toDistance = signedDistance(field.cells);
      field.morphStarted = field.clock;
      field.morphDuration = 420;
      field.morphFrames = prepareMorphFrames(field.fromDistance, field.toDistance, 20);
      field.morphId += 1;
      field.cellVersion += 1;
      field.arcCount = contourPathCount(field.morphFrames[field.morphFrames.length - 1] ?? []);
      resetGenerationPipeline();
      needsDraw = true;
    });
  }

  let raf = 0;
  let lastFrame = performance.now();
  let lastDraw = 0;
  const loop = (now: number) => {
    if (destroyed) return;
    const elapsed = Math.min(50, Math.max(0, now - lastFrame));
    lastFrame = now;
    const active = visible
      && !document.hidden
      && !paused
      && !(respectReducedMotion && reducedMotion);

    if (active) {
      field.clock += elapsed;
      const interval = 1720 - speed * 135;
      if (pipelineInterval > 0 && Math.abs(pipelineInterval - interval) > .5) {
        resetGenerationPipeline();
      }
      const generationAge = field.clock - field.generationStarted;
      const initialPhase = field.generation < 20;
      const workerWarmup = Math.min(initialPhase ? 180 : 140, interval * (initialPhase ? .24 : .18));
      if (generationWorker && !workerFailed && !workerBusy && preparedGenerations.length === 0 && generationAge >= workerWarmup) {
        const id = ++requestSerial;
        activeRequestId = id;
        workerBusy = true;
        pipelineInterval = interval;
        const cells = field.cells.slice();
        const ages = field.ages.slice();
        const fromDistance = distanceAtClock(field, field.generationStarted + interval);
        generationWorker.postMessage(
          {
            id,
            cells,
            ages,
            fromDistance,
            frameCount: morphFrameBudget(field),
            horizon: initialPhase ? 1 : 2,
            chunkSize: initialPhase ? 2 : 4,
            yieldMs: initialPhase ? 8 : 4,
          },
          [cells.buffer, ages.buffer, fromDistance.buffer],
        );
      }
      if (field.clock - field.generationStarted >= interval) {
        const prepared = preparedGenerations.shift();
        if (prepared) {
          applyPreparedGeneration(field, prepared, interval);
          if (preparedGenerations.length === 0 && !workerBusy) pipelineInterval = 0;
        } else if (!generationWorker || workerFailed) {
          stepField(field, interval);
        }
      }
      needsDraw = true;
    }

    const drawDue = !active || lastDraw === 0 || now - lastDraw >= 15;
    if (visible && needsDraw && drawDue) {
      const drawElapsed = lastDraw === 0 ? elapsed : Math.min(50, now - lastDraw);
      lastDraw = now;
      drawField(canvas, field, cache, {
        burnMemory,
        particles,
        elapsed: drawElapsed,
        active,
      });
      needsDraw = active;
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  window.addEventListener('pagehide', () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    motionQuery.removeEventListener?.('change', updateMotion);
    document.removeEventListener('visibilitychange', requestDraw);
    generationWorker?.terminate();
  }, { once: true });
}

document.querySelectorAll<HTMLCanvasElement>('canvas[data-smolder-life]').forEach(initialize);
