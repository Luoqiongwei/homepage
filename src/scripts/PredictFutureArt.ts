type Point3 = { x: number; y: number; z: number };
type Ink = { line: string; bright: string; accent: string; haze: string; shade: string };
type NoveltyNode = {
  parent: number;
  born: number;
  seen: number;
  weight: number;
  depth: number;
  x: number;
  y: number;
  children: number[];
};
type NoveltyHistory = { selected: number; novel: boolean }[];

const TAU = Math.PI * 2;
const NOVELTY_STEPS = 28;

// Tria 等（2014）的触发式 Pólya 瓮：N₀=3，ρ=2，ν=2。
// 一次首次抽中会加入 ν+1 个全新颜色。
function noveltySequence(seed: number): { nodes: NoveltyNode[]; history: NoveltyHistory; depth: number } {
  let state = (Math.floor(seed * 100003) ^ 0x6d2b79f5) >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const nodes: NoveltyNode[] = Array.from({ length: 3 }, () => ({
    parent: -1, born: 0, seen: 0, weight: 1, depth: 0, x: 0, y: 0, children: [],
  }));
  const history: NoveltyHistory = [];
  for (let step = 1; step <= NOVELTY_STEPS; step++) {
    let draw = random() * nodes.reduce((sum, node) => sum + node.weight, 0);
    let selected = nodes.length - 1;
    for (let index = 0; index < nodes.length; index++) {
      draw -= nodes[index].weight;
      if (draw < 0) { selected = index; break; }
    }
    const node = nodes[selected];
    const novel = node.seen === 0;
    node.weight += 2;
    history.push({ selected, novel });
    if (novel) {
      node.seen = step;
      for (let child = 0; child < 3; child++) {
        node.children.push(nodes.length);
        nodes.push({ parent: selected, born: step, seen: 0, weight: 1, depth: node.depth + 1, x: 0, y: 0, children: [] });
      }
    }
  }
  const depth = Math.max(...nodes.map((node) => node.depth));
  const mass = nodes.map(() => 1);
  for (let index = nodes.length - 1; index >= 0; index--) {
    for (const child of nodes[index].children) mass[index] += mass[child];
  }
  const place = (index: number, start: number, end: number) => {
    const node = nodes[index];
    const theta = (start + end) / 2;
    const distance = 0.17 + node.depth / Math.max(1, depth) * 0.82;
    node.x = Math.cos(theta) * distance;
    node.y = Math.sin(theta) * distance;
    const total = node.children.reduce((sum, child) => sum + mass[child], 0);
    let cursor = start;
    for (const child of node.children) {
      const span = (end - start) * mass[child] / total;
      place(child, cursor + span * 0.055, cursor + span * 0.945);
      cursor += span;
    }
  };
  let sector = -Math.PI * 0.9;
  const total = mass[0] + mass[1] + mass[2];
  for (let index = 0; index < 3; index++) {
    const span = TAU * mass[index] / total;
    place(index, sector + 0.065, sector + span - 0.065);
    sector += span;
  }
  return { nodes, history, depth };
}

function lorenz(seed: number, offset: number): Point3[] {
  let x = 0.12 + Math.sin(seed * 1.73) * 0.04 + offset;
  let y = 0;
  let z = 0;
  const points: Point3[] = [];
  const step = 0.006;
  for (let index = 0; index < 3200; index++) {
    const dx = 10 * (y - x);
    const dy = x * (28 - z) - y;
    const dz = x * y - (8 / 3) * z;
    x += dx * step;
    y += dy * step;
    z += dz * step;
    if (index > 240 && index % 2 === 0) {
      points.push({ x: x / 22, y: -(z - 25) / 24, z: y / 31 });
    }
  }
  return points;
}

function initPredictFutureArt(root: HTMLElement): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas[data-future-art]');
  const context = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !context) return () => {};

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 1;
  let height = 1;
  let ratio = 1;
  let centerX = 0;
  let centerY = 0;
  let radius = 1;
  let frame = 0;
  let lastFrame = 0;
  let time = 0;
  const seed = 1;
  let scene = Number(root.dataset.scene) || 0;
  let progress = Math.max(0, Math.min(1, Number(root.dataset.sceneProgress) || 0));
  let previousScene = scene;
  let blend = 1;
  let destroyed = false;
  const trajectories = [lorenz(seed, 0), lorenz(seed, 0.00008)];
  const novelty = noveltySequence(seed);
  let ink: Ink;

  function setPalette() {
    const theme = document.documentElement.dataset.bsTheme;
    ink = theme === 'light'
      ? { line: '42, 107, 117', bright: '40, 73, 87', accent: '184, 69, 51', haze: '62, 146, 158', shade: '233, 239, 235' }
      : { line: '108, 177, 187', bright: '205, 228, 229', accent: '234, 111, 86', haze: '63, 148, 173', shade: '12, 24, 29' };
  }

  function stroke(color: string, alpha: number, lineWidth = 0.65) {
    context!.strokeStyle = `rgba(${color}, ${alpha})`;
    context!.lineWidth = lineWidth;
  }

  function project(point: Point3, angle = 0, tilt = -0.23): Point3 {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const x = point.x * cos + point.z * sin;
    const z = -point.x * sin + point.z * cos;
    const y = point.y * Math.cos(tilt) - z * Math.sin(tilt);
    const depth = point.y * Math.sin(tilt) + z * Math.cos(tilt);
    const perspective = 4.8 / (4.8 - depth);
    return { x: centerX + x * radius * perspective, y: centerY + y * radius * perspective, z: depth };
  }

  function curve(
    sample: (t: number) => Point3,
    color: string,
    alpha: number,
    angle = 0,
    segments = 100,
    lineWidth = 0.65,
  ) {
    stroke(color, alpha, lineWidth);
    context!.beginPath();
    for (let index = 0; index <= segments; index++) {
      const point = project(sample(index / segments), angle);
      if (index === 0) context!.moveTo(point.x, point.y);
      else context!.lineTo(point.x, point.y);
    }
    context!.stroke();
  }

  function dot(point: Point3, color: string, size: number, alpha: number, angle = 0) {
    const projected = project(point, angle);
    context!.fillStyle = `rgba(${color}, ${alpha})`;
    context!.beginPath();
    context!.arc(projected.x, projected.y, size, 0, TAU);
    context!.fill();
  }

  function orbit(t: number, size: number, tilt: number, phase = 0): Point3 {
    const theta = t * TAU + phase;
    return {
      x: Math.cos(theta) * size,
      y: Math.sin(theta) * Math.sin(tilt) * size,
      z: Math.sin(theta) * Math.cos(tilt) * size,
    };
  }

  function measurement(alpha: number, angle: number) {
    const ring = radius * 1.23;
    context!.save();
    context!.translate(centerX, centerY);
    context!.rotate(-0.16);
    stroke(ink.line, alpha * 0.2, 0.6);
    context!.beginPath();
    context!.arc(0, 0, ring, -0.94, 2.14);
    context!.arc(0, 0, ring, 2.37, 4.99);
    context!.stroke();
    for (let index = 0; index < 120; index++) {
      const theta = index / 120 * TAU;
      const major = index % 10 === 0;
      const inner = ring - (major ? 8 : 3);
      stroke(major ? ink.bright : ink.line, alpha * (major ? 0.5 : 0.24));
      context!.beginPath();
      context!.moveTo(Math.cos(theta) * inner, Math.sin(theta) * inner);
      context!.lineTo(Math.cos(theta) * ring, Math.sin(theta) * ring);
      context!.stroke();
    }
    context!.rotate(angle * 0.08);
    stroke(ink.accent, alpha * 0.8, 1.4);
    context!.beginPath();
    context!.arc(0, 0, ring, -0.45, -0.34);
    context!.stroke();
    context!.restore();

    stroke(ink.line, alpha * 0.18);
    context!.setLineDash([2, 6]);
    context!.beginPath();
    context!.moveTo(centerX - radius * 1.46, centerY);
    context!.lineTo(centerX + radius * 1.46, centerY);
    context!.moveTo(centerX, centerY - radius * 1.43);
    context!.lineTo(centerX, centerY + radius * 1.43);
    context!.stroke();
    context!.setLineDash([]);
    context!.fillStyle = `rgba(${ink.line}, ${alpha * 0.5})`;
    context!.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
    context!.fillText('0.000', centerX + 7, centerY - radius * 1.34);
    context!.fillText('∞', centerX + radius * 1.34, centerY - 8);
  }

  function sphere(alpha: number, angle: number, amplitude = 0.045) {
    const phase = seed * 1.618;
    for (let meridian = 0; meridian < 34; meridian++) {
      const longitude = meridian / 34 * TAU;
      curve((t) => {
        const latitude = (t - 0.5) * Math.PI;
        const wave = Math.sin(latitude * 5 + phase + time * 0.09) * amplitude;
        return {
          x: Math.cos(latitude) * Math.cos(longitude + wave),
          y: Math.sin(latitude),
          z: Math.cos(latitude) * Math.sin(longitude + wave),
        };
      }, ink.line, alpha * (0.23 + 0.12 * Math.sin(longitude + angle)), angle, 72);
    }
    for (let parallel = 1; parallel < 19; parallel++) {
      const latitude = (parallel / 19 - 0.5) * Math.PI;
      curve((t) => ({
        x: Math.cos(latitude) * Math.cos(t * TAU),
        y: Math.sin(latitude),
        z: Math.cos(latitude) * Math.sin(t * TAU),
      }), ink.line, alpha * 0.2, angle, 100);
    }
    for (let index = 0; index < 48; index++) {
      const latitude = Math.asin(1 - 2 * (index + 0.5) / 48);
      const longitude = index * 2.399963 + phase;
      const point = {
        x: Math.cos(latitude) * Math.cos(longitude),
        y: Math.sin(latitude),
        z: Math.cos(latitude) * Math.sin(longitude),
      };
      if (project(point, angle).z > -0.2) dot(point, ink.bright, 1, alpha * 0.62, angle);
    }
  }

  function drawHero(alpha: number, angle: number) {
    sphere(alpha, angle, 0.035 + progress * 0.035);
    for (let index = 0; index < 4; index++) {
      const tilt = -0.66 + index * 0.41 + Math.sin(seed) * 0.08;
      curve((t) => orbit(t, 1.12 + index * 0.075, tilt), ink.line, alpha * 0.34, angle * 0.28, 160);
    }
    const trajectory = (t: number) => {
      const theta = t * TAU;
      const loopRadius = 1.015 + Math.sin(theta * 3 + seed) * 0.045;
      return {
        x: loopRadius * Math.cos(theta),
        y: Math.sin(theta * 2 + seed * 0.4) * 0.56,
        z: loopRadius * Math.sin(theta),
      };
    };
    curve(trajectory, ink.accent, alpha * 0.73, angle, 160, 0.9);
    const cursor = ((time * 0.018 + seed * 0.13) % 1 + 1) % 1;
    dot(trajectory(cursor), ink.accent, 2.7, alpha, angle);
    dot(trajectory(cursor), ink.accent, 7, alpha * 0.1, angle);
  }

  function drawOrbits(alpha: number, angle: number) {
    sphere(alpha * 0.45, angle);
    for (let index = 0; index < 9; index++) {
      const orbitSize = 0.42 + index * 0.112;
      const tilt = 0.22 + Math.sin(seed * 0.71) * 0.09;
      curve((t) => orbit(t, orbitSize, tilt), ink.line, alpha * (index % 3 === 0 ? 0.55 : 0.23), -0.34, 140);
    }
    const phase = time * 0.05 + seed * 0.29;
    const planet = orbit(phase, 1.1, 0.26);
    const p = project(planet, -0.34);
    const discRadius = radius * 0.185;
    const glow = context!.createRadialGradient(p.x, p.y, discRadius * 0.8, p.x, p.y, discRadius * 1.65);
    glow.addColorStop(0, `rgba(${ink.accent}, ${alpha * 0.17})`);
    glow.addColorStop(1, `rgba(${ink.accent}, 0)`);
    context!.fillStyle = glow;
    context!.beginPath();
    context!.arc(p.x, p.y, discRadius * 1.65, 0, TAU);
    context!.fill();
    context!.fillStyle = `rgba(${ink.shade}, ${alpha * 0.95})`;
    stroke(ink.accent, alpha * 0.9, 0.9);
    context!.beginPath();
    context!.arc(p.x, p.y, discRadius, 0, TAU);
    context!.fill();
    context!.stroke();
    dot({ x: 0, y: 0, z: 0 }, ink.bright, 3, alpha * 0.8);
    curve((t) => ({ x: planet.x * t, y: planet.y * t, z: planet.z * t }), ink.accent, alpha * 0.35, -0.34, 2);
  }

  function drawOrder(alpha: number, _angle: number) {
    // 《克里提亚篇》115–116：中心岛直径 5 stadia，向外三水环与两陆环交错。
    const scale = radius * 0.99 / 13.5;
    const rings = [0, 2.5, 3.5, 5.5, 7.5, 10.5, 13.5];
    const circle = (r: number) => {
      context!.beginPath();
      context!.arc(0, 0, r * scale, 0, TAU);
    };
    context!.save();
    context!.translate(centerX, centerY - radius * 0.04);
    context!.scale(1, 0.78);
    for (let band = 0; band < rings.length - 1; band++) {
      const inner = rings[band];
      const outer = rings[band + 1];
      const water = band % 2 === 1;
      context!.beginPath();
      context!.arc(0, 0, outer * scale, 0, TAU);
      if (inner) context!.arc(0, 0, inner * scale, 0, TAU, true);
      context!.fillStyle = `rgba(${water ? ink.haze : ink.shade}, ${alpha * (water ? 0.13 : 0.63)})`;
      context!.fill('evenodd');
      if (water) {
        for (let r = inner + 0.22; r < outer - 0.1; r += 0.31) {
          stroke(ink.line, alpha * 0.18, 0.5);
          circle(r);
          context!.stroke();
        }
      } else if (band > 0) {
        const streets = band === 2 ? 24 : 48;
        for (let index = 0; index < streets; index++) {
          const theta = index / streets * TAU;
          stroke(ink.line, alpha * 0.26, 0.55);
          context!.beginPath();
          context!.moveTo(Math.cos(theta) * (inner + 0.15) * scale, Math.sin(theta) * (inner + 0.15) * scale);
          context!.lineTo(Math.cos(theta) * (outer - 0.15) * scale, Math.sin(theta) * (outer - 0.15) * scale);
          context!.stroke();
          if (index % 2 === 0 && index !== streets / 4) {
            context!.save();
            context!.rotate(theta);
            const length = (outer - inner) * scale * 0.54;
            stroke(ink.bright, alpha * 0.29, 0.55);
            context!.strokeRect((inner + (outer - inner) * 0.23) * scale, -scale * 0.19, length, scale * 0.38);
            context!.restore();
          }
        }
        for (const fraction of [0.19, 0.81]) {
          stroke(ink.line, alpha * 0.32, 0.55);
          circle(inner + (outer - inner) * fraction);
          context!.stroke();
        }
      }
    }
    for (let index = 1; index < rings.length; index++) {
      stroke(ink.bright, alpha * 0.57, 0.8);
      circle(rings[index]);
      context!.stroke();
      if ([1, 3, 5].includes(index)) {
        stroke(ink.line, alpha * 0.4, 0.55);
        circle(rings[index] - 0.1);
        context!.stroke();
      }
    }

    // 通海运河切过陆环，桥面以横向细线标记；保持固定北向便于阅读。
    const canalHalf = scale * 0.18;
    context!.fillStyle = `rgba(${ink.shade}, ${alpha * 0.98})`;
    context!.fillRect(-canalHalf, 2.5 * scale, canalHalf * 2, 12.85 * scale);
    context!.fillStyle = `rgba(${ink.haze}, ${alpha * 0.16})`;
    context!.fillRect(-canalHalf, 2.5 * scale, canalHalf * 2, 12.85 * scale);
    stroke(ink.line, alpha * 0.7, 0.8);
    context!.beginPath();
    for (const side of [-1, 1]) {
      context!.moveTo(side * canalHalf, 2.5 * scale);
      context!.lineTo(side * canalHalf, 15.35 * scale);
    }
    context!.stroke();
    for (const midpoint of [4.5, 9]) {
      context!.fillStyle = `rgba(${ink.shade}, ${alpha * 0.95})`;
      context!.fillRect(-scale * 0.55, (midpoint - 0.18) * scale, scale * 1.1, scale * 0.36);
      stroke(ink.bright, alpha * 0.83, 0.8);
      context!.strokeRect(-scale * 0.55, (midpoint - 0.18) * scale, scale * 1.1, scale * 0.36);
      for (let plank = -2; plank <= 2; plank++) {
        context!.beginPath();
        context!.moveTo(plank * scale * 0.18, (midpoint - 0.18) * scale);
        context!.lineTo(plank * scale * 0.18, (midpoint + 0.18) * scale);
        context!.stroke();
      }
    }

    for (const terrace of [1.65, 1.35, 1]) {
      stroke(terrace === 1 ? ink.accent : ink.bright, alpha * 0.7, terrace === 1 ? 0.9 : 0.6);
      context!.strokeRect(-terrace * scale, -terrace * scale * 0.61, terrace * scale * 2, terrace * scale * 1.22);
    }
    stroke(ink.line, alpha * 0.8, 0.7);
    for (let column = -3; column <= 3; column++) {
      for (const side of [-1, 1]) {
        context!.beginPath();
        context!.arc(column * scale * 0.38, side * scale * 0.76, scale * 0.065, 0, TAU);
        context!.stroke();
      }
    }
    context!.restore();

    stroke(ink.line, alpha * 0.52, 0.7);
    const northX = centerX + radius * 0.93;
    const northY = centerY - radius * 0.92;
    context!.beginPath();
    context!.moveTo(northX, northY + 24);
    context!.lineTo(northX, northY);
    context!.lineTo(northX - 3, northY + 7);
    context!.moveTo(northX, northY);
    context!.lineTo(northX + 3, northY + 7);
    context!.stroke();
    context!.fillStyle = `rgba(${ink.bright}, ${alpha * 0.68})`;
    context!.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
    context!.fillText('N', northX - 3, northY - 7);
    context!.fillText('CRITIAS  115–116', centerX - radius * 0.91, centerY + radius * 1.01);
    context!.fillStyle = `rgba(${ink.line}, ${alpha * 0.65})`;
    context!.fillText('5 / 1 / 2 / 2 / 3 / 3  STADIA', centerX - radius * 0.91, centerY + radius * 1.01 + 14);
  }

  function drawChaos(alpha: number, angle: number) {
    for (let trace = 0; trace < trajectories.length; trace++) {
      const points = trajectories[trace];
      stroke(trace === 0 ? ink.line : ink.accent, alpha * (trace === 0 ? 0.65 : 0.48), 0.8);
      context!.beginPath();
      for (let index = 0; index < points.length; index++) {
        const point = project(points[index], angle * 0.32 + 0.2);
        if (index === 0) context!.moveTo(point.x, point.y);
        else context!.lineTo(point.x, point.y);
      }
      context!.stroke();
      const cursor = Math.floor((time * 34 + seed * 137) % points.length);
      dot(points[cursor], trace === 0 ? ink.bright : ink.accent, 2.4, alpha, angle * 0.32 + 0.2);
    }
    curve((t) => orbit(t, 1.18, -0.5), ink.line, alpha * 0.15, angle * 0.1, 140);
  }

  function drawGrowth(alpha: number, _angle: number) {
    // 已抽中为实心；未抽中的可遇颜色为空心；本步引入的颜色与边为朱红。
    const step = Math.min(NOVELTY_STEPS, 4 + Math.floor(progress * (NOVELTY_STEPS - 4)));
    const { nodes, history, depth } = novelty;
    const current = history[step - 1].selected;
    const counts = nodes.map(() => 0);
    for (let index = 0; index < step; index++) counts[history[index].selected]++;
    const point = (node: NoveltyNode) => ({ x: centerX + node.x * radius, y: centerY + node.y * radius });
    let available = 0;
    let encountered = 0;

    for (let layer = 0; layer <= depth; layer++) {
      const r = radius * (0.17 + layer / Math.max(1, depth) * 0.82);
      stroke(ink.line, alpha * 0.11, 0.55);
      context!.setLineDash([1, 5]);
      context!.beginPath();
      context!.arc(centerX, centerY, r, 0, TAU);
      context!.stroke();
    }
    context!.setLineDash([]);

    for (const node of nodes) {
      if (node.born > step || node.parent < 0) continue;
      const parent = nodes[node.parent];
      const from = point(parent);
      const to = point(node);
      const fresh = node.born === step;
      const unseen = node.seen === 0 || node.seen > step;
      stroke(fresh ? ink.accent : ink.line, alpha * (fresh ? 0.82 : unseen ? 0.37 : 0.57), fresh ? 1 : 0.65);
      context!.setLineDash(fresh ? [3, 3] : unseen ? [1, 3] : []);
      context!.beginPath();
      context!.moveTo(from.x, from.y);
      const middle = Math.hypot(parent.x, parent.y) * 0.36 + Math.hypot(node.x, node.y) * 0.64;
      const parentTheta = Math.atan2(parent.y, parent.x);
      const childTheta = Math.atan2(node.y, node.x);
      context!.bezierCurveTo(
        centerX + Math.cos(parentTheta) * middle * radius,
        centerY + Math.sin(parentTheta) * middle * radius,
        centerX + Math.cos(childTheta) * middle * radius,
        centerY + Math.sin(childTheta) * middle * radius,
        to.x, to.y,
      );
      context!.stroke();
    }
    context!.setLineDash([]);

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.born > step) continue;
      available++;
      const seen = counts[index] > 0;
      if (seen) encountered++;
      const fresh = node.born === step;
      const active = index === current;
      const color = fresh || active ? ink.accent : seen ? ink.bright : ink.line;
      const p = point(node);
      const size = seen ? 2.3 + Math.log2(1 + counts[index] * 2) * 0.6 : 2.5;
      context!.fillStyle = `rgba(${seen ? color : ink.shade}, ${alpha * (seen ? 0.94 : 0.9)})`;
      stroke(color, alpha * (fresh || active ? 0.95 : seen ? 0.75 : 0.66), 0.8);
      context!.beginPath();
      context!.arc(p.x, p.y, size, 0, TAU);
      context!.fill();
      context!.stroke();
      if (seen) {
        stroke(color, alpha * (active ? 0.7 : 0.3), 0.7);
        context!.beginPath();
        context!.arc(p.x, p.y, size + 3.7 + (active ? Math.sin(time * 1.4) * 0.7 : 0), -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(0.92, 0.18 + counts[index] / 7));
        context!.stroke();
      }
      if (active || node.parent < 0) {
        context!.font = '8px ui-monospace, SFMono-Regular, Consolas, monospace';
        context!.fillStyle = `rgba(${color}, ${alpha * 0.72})`;
        context!.fillText(`c${String(index + 1).padStart(2, '0')}`, p.x + size + 5, p.y - 5);
      }
    }

    // 抽取序列保留重复项：重复强化与首次发现的差异也出现在时间尺上。
    const timelineX = centerX - radius * 0.77;
    const timelineY = centerY + radius * 1.08;
    const spacing = radius * 1.54 / (NOVELTY_STEPS - 1);
    for (let index = 0; index < NOVELTY_STEPS; index++) {
      const passed = index < step;
      stroke(history[index].novel && passed ? ink.accent : ink.line, alpha * (passed ? 0.75 : 0.16), 1);
      const x = timelineX + index * spacing;
      context!.beginPath();
      context!.moveTo(x, timelineY);
      context!.lineTo(x, timelineY - (history[index].novel ? 7 : 3));
      context!.stroke();
    }
    context!.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
    context!.fillStyle = `rgba(${ink.bright}, ${alpha * 0.72})`;
    context!.fillText(`t ${String(step).padStart(2, '0')} / ${NOVELTY_STEPS}`, timelineX, timelineY + 17);
    context!.fillStyle = `rgba(${ink.line}, ${alpha * 0.7})`;
    context!.textAlign = 'right';
    context!.fillText(`D ${String(encountered).padStart(2, '0')}  /  N ${String(available).padStart(2, '0')}`, timelineX + spacing * (NOVELTY_STEPS - 1), timelineY + 17);
    context!.textAlign = 'left';
  }

  const scenes = [drawHero, drawOrbits, drawOrder, drawChaos, drawGrowth];

  function draw() {
    context!.clearRect(0, 0, width, height);
    const angle = time * 0.035 + seed * 0.47 + progress * 0.25;
    const glow = context!.createRadialGradient(centerX, centerY, radius * 0.08, centerX, centerY, radius * 1.45);
    glow.addColorStop(0, `rgba(${ink.haze}, 0.045)`);
    glow.addColorStop(0.65, `rgba(${ink.haze}, 0.02)`);
    glow.addColorStop(1, `rgba(${ink.haze}, 0)`);
    context!.fillStyle = glow;
    context!.fillRect(0, 0, width, height);
    measurement(1, angle);
    if (blend < 1) scenes[previousScene](1 - blend, angle);
    scenes[scene](blend, angle);
    if (root.dataset.artReady !== 'true') root.dataset.artReady = 'true';
  }

  function running() {
    return !destroyed && !document.hidden && !motionPreference.matches;
  }

  function tick(timestamp: number) {
    frame = 0;
    if (!running()) return;
    if (timestamp - lastFrame >= 1000 / 30) {
      const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.07) : 1 / 30;
      lastFrame = timestamp;
      time += delta;
      blend = Math.min(1, blend + delta / 0.9);
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function refresh() {
    if (destroyed) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    // 后台与减少动态模式始终保留完整的静态图景。
    if (!running()) blend = 1;
    draw();
    if (running()) frame = requestAnimationFrame(tick);
  }

  function fit() {
    const rect = canvas!.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas!.width = Math.round(width * ratio);
    canvas!.height = Math.round(height * ratio);
    context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    const mobile = width < 760;
    centerX = width * (mobile ? 0.67 : 0.745);
    centerY = height * (mobile ? 0.37 : 0.49);
    radius = Math.min(width * (mobile ? 0.5 : 0.255), height * 0.37, 390);
    refresh();
  }

  const observer = new MutationObserver((mutations) => {
    let needsRefresh = false;
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-bs-theme') {
        setPalette();
        needsRefresh = true;
      } else if (mutation.attributeName === 'data-scene') {
        const next = Math.max(0, Math.min(4, Number(root.dataset.scene) || 0));
        if (next !== scene) {
          previousScene = scene;
          scene = next;
          blend = 0;
          needsRefresh = true;
        }
      } else if (mutation.attributeName === 'data-scene-progress') {
        progress = Math.max(0, Math.min(1, Number(root.dataset.sceneProgress) || 0));
        if (!running()) draw();
      }
    }
    if (needsRefresh) refresh();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-scene', 'data-scene-progress'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
  const resizeObserver = new ResizeObserver(fit);
  setPalette();
  resizeObserver.observe(canvas);
  fit();
  document.addEventListener('visibilitychange', refresh);
  motionPreference.addEventListener('change', refresh);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', refresh);
    motionPreference.removeEventListener('change', refresh);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', refresh);
    delete root.dataset.artReady;
  }
  function onPageHide(event: PageTransitionEvent) {
    if (event.persisted) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else destroy();
  }
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', refresh);
  return destroy;
}

export function initPredictFuture() {
  const root = document.getElementById('future-page');
  if (!(root instanceof HTMLElement)) return;

  const progress = document.getElementById('reading-progress');
  const chapters = Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]'));
  let scrollFrame = 0;

  function updateThemeMeta() {
    const dark = document.documentElement.dataset.bsTheme === 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1014' : '#f0f0e9');
  }

  function updateScroll() {
    scrollFrame = 0;
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${distance > 0 ? Math.min(1, window.scrollY / distance) : 0})`;
    const readingLine = window.innerHeight * .4;
    let scene = 0;
    let sceneProgress = 0;
    for (const chapter of chapters) {
      const rect = chapter.getBoundingClientRect();
      if (rect.top <= readingLine) {
        scene = Number(chapter.dataset.chapter);
        sceneProgress = Math.max(0, Math.min(1, (readingLine - rect.top) / rect.height));
      }
    }
    // 属性只在数值确实变化时写入，避免静态画面产生多余重绘。
    if (root!.dataset.scene !== String(scene)) root!.dataset.scene = String(scene);
    const value = sceneProgress.toFixed(3);
    if (root!.dataset.sceneProgress !== value) root!.dataset.sceneProgress = value;
  }

  function scheduleScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }

  updateThemeMeta();
  updateScroll();
  const destroyArt = initPredictFutureArt(root);
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', scheduleScroll);
  const themeObserver = new MutationObserver(updateThemeMeta);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) {
      updateThemeMeta();
      scheduleScroll();
    }
  }

  function onPageHide(event: PageTransitionEvent) {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    // 往返缓存会保留这份文档，回到页面时继续使用原有交互。
    if (event.persisted) return;
    destroyArt();
    window.removeEventListener('scroll', scheduleScroll);
    window.removeEventListener('resize', scheduleScroll);
    themeObserver.disconnect();
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  }
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
}
