/// <reference lib="webworker" />

const COLS = 74;
const ROWS = 48;
const COUNT = COLS * ROWS;
const INF = 9999;

type Point = { x: number; y: number };
type EdgeName = 't' | 'r' | 'b' | 'l';
type Segment = [Point, Point];
type PackedContourFrame = { points: Float32Array; offsets: Uint32Array };

type GenerationRequest = {
  id: number;
  cells: Uint8Array;
  ages: Uint16Array;
  fromDistance: Float32Array;
  frameCount: number;
  horizon: number;
  chunkSize: number;
  yieldMs: number;
};

const CASES: Record<number, [EdgeName, EdgeName][]> = {
  1: [['l', 't']], 2: [['t', 'r']], 3: [['l', 'r']], 4: [['r', 'b']],
  5: [['t', 'r'], ['b', 'l']], 6: [['t', 'b']], 7: [['l', 'b']],
  8: [['b', 'l']], 9: [['t', 'b']], 10: [['l', 't'], ['r', 'b']],
  11: [['r', 'b']], 12: [['l', 'r']], 13: [['t', 'r']], 14: [['l', 't']],
};

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

function flowEase(linear: number) {
  return linear * (.82 + .18 * (3 * linear - 2 * linear * linear));
}

function interpolateEdge(a: number, b: number) {
  const denominator = a - b;
  if (Math.abs(denominator) < .00001) return .5;
  return Math.max(.04, Math.min(.96, a / denominator));
}

function marchingSegments(values: Float32Array): Segment[] {
  const segments: Segment[] = [];
  for (let y = 0; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS - 1; x++) {
      const tl = values[y * COLS + x];
      const tr = values[y * COLS + x + 1];
      const br = values[(y + 1) * COLS + x + 1];
      const bl = values[(y + 1) * COLS + x];
      const code = (tl > 0 ? 1 : 0) | (tr > 0 ? 2 : 0) | (br > 0 ? 4 : 0) | (bl > 0 ? 8 : 0);
      const topology = CASES[code];
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
      const key = pointKey(segment[endpoint]);
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

function packFrame(paths: Point[][]): PackedContourFrame {
  let pointCount = 0;
  for (const path of paths) pointCount += path.length;
  const points = new Float32Array(pointCount * 2);
  const offsets = new Uint32Array(paths.length + 1);
  let cursor = 0;
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    offsets[pathIndex] = cursor;
    for (const point of paths[pathIndex]) {
      points[cursor++] = point.x;
      points[cursor++] = point.y;
    }
  }
  offsets[paths.length] = cursor;
  return { points, offsets };
}

async function prepareMorphFrames(
  from: Float32Array,
  to: Float32Array,
  frameCount: number,
  requestId: number,
  chunkSize: number,
  yieldMs: number,
) {
  const frames: PackedContourFrame[] = [];
  const values = new Float32Array(COUNT);
  for (let frame = 0; frame < frameCount; frame++) {
    const progress = flowEase(frame / Math.max(1, frameCount - 1));
    for (let i = 0; i < COUNT; i++) values[i] = from[i] * (1 - progress) + to[i] * progress;
    frames.push(packFrame(stitchSegments(marchingSegments(values))));
    if ((frame + 1) % Math.max(1, chunkSize) === 0 && frame + 1 < frameCount) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, yieldMs)));
      if (requestId !== latestRequestId) return null;
    }
  }
  return frames;
}

function interpolateDistance(from: Float32Array, to: Float32Array, progress: number) {
  const result = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) result[i] = from[i] * (1 - progress) + to[i] * progress;
  return result;
}

function nextGeneration(cells: Uint8Array, ages: Uint16Array) {
  const next = new Uint8Array(COUNT);
  const nextAges = new Uint16Array(COUNT);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) neighbors += cells[indexAt(x + dx, y + dy)];
        }
      }
      const alive = cells[i] === 1;
      const nextAlive = (alive && (neighbors === 2 || neighbors === 3)) || (!alive && neighbors === 3);
      next[i] = nextAlive ? 1 : 0;
      nextAges[i] = nextAlive ? (alive ? Math.min(65535, ages[i] + 1) : 1) : 0;
    }
  }
  return { cells: next, ages: nextAges };
}

let latestRequestId = 0;

self.onmessage = async (event: MessageEvent<GenerationRequest>) => {
  const request = event.data;
  latestRequestId = request.id;
  let cells = request.cells;
  let ages = request.ages;
  let fromDistance = request.fromDistance;
  const boundaryProgress = flowEase(1 / 1.04);

  for (let horizonIndex = 0; horizonIndex < Math.max(1, request.horizon); horizonIndex++) {
    const next = nextGeneration(cells, ages);
    const toDistance = signedDistance(next.cells);
    const morphFrames = await prepareMorphFrames(
      fromDistance,
      toDistance,
      request.frameCount,
      request.id,
      request.chunkSize,
      request.yieldMs,
    );
    if (!morphFrames || request.id !== latestRequestId) return;
    const step = {
      cells: next.cells,
      ages: next.ages,
      fromDistance,
      toDistance,
      morphFrames,
      arcCount: Math.max(0, (morphFrames[morphFrames.length - 1]?.offsets.length ?? 1) - 1),
    };
    const transfer: Transferable[] = [next.cells.buffer, next.ages.buffer, fromDistance.buffer, toDistance.buffer];
    for (const frame of morphFrames) transfer.push(frame.points.buffer, frame.offsets.buffer);
    const nextFromDistance = interpolateDistance(fromDistance, toDistance, boundaryProgress);
    const nextCells = next.cells.slice();
    const nextAges = next.ages.slice();
    const complete = horizonIndex + 1 >= Math.max(1, request.horizon);
    self.postMessage({
      id: request.id,
      steps: [step],
      append: horizonIndex > 0,
      complete,
    }, transfer);
    cells = nextCells;
    ages = nextAges;
    fromDistance = nextFromDistance;
    if (!complete) {
      await new Promise((resolve) => setTimeout(resolve, 24));
      if (request.id !== latestRequestId) return;
    }
  }
};

export {};
