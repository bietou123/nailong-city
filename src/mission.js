export const STORY = [
  { id: 'dessert', letter: 'S', title: '街角的甜点', color: '#ffd064',
    steps: [
      { type: 'reach', x: 72, z: 72, radius: 8, text: '前往街角甜甜圈店领取包裹' },
      { type: 'reach', x: -144, z: 144, radius: 8, text: '把包裹送到绿荫公园',
        duration: 110, reward: 180 },
    ] },
  { id: 'express', letter: 'W', title: '海风速递', color: '#69c4c8',
    steps: [
      { type: 'reach', x: -144, z: -144, radius: 8, text: '去海风游戏厅接新订单' },
      { type: 'reach', x: 144, z: -144, radius: 8, text: '送到海滨舞台',
        duration: 125, reward: 260 },
    ] },
  { id: 'heist', letter: 'M', title: '便利店风云', color: '#7fd4a2',
    steps: [
      { type: 'reach', x: 82, z: 110, radius: 9, text: '去 24/7 便利店找店长' },
      { type: 'rob', x: 82, z: 110, radius: 9, text: '抢下收银台的现金',
        reward: 450, wanted: 3 },
      { type: 'escape', text: '甩掉警察，让通缉清零' },
      { type: 'reach', x: -144, z: 144, radius: 8, text: '把现金交给绿荫公园的同伙',
        reward: 620 },
    ] },
  { id: 'race', letter: 'R', title: '夜路狂飙', color: '#ff9b6a',
    steps: [
      { type: 'race', text: '限时冲过全部检查点', duration: 85, reward: 800,
        points: [{ x: 144, z: 72 }, { x: 144, z: 216 }, { x: 216, z: 216 },
          { x: 216, z: 144 }, { x: 216, z: -36 }] },
    ] },
  { id: 'revenue', letter: 'A', title: '最后的账', color: '#ff6f6a',
    steps: [
      { type: 'kill', text: '解决码头的目标人物',
        target: { x: -216, z: -144, name: '码头老陈' }, count: 1, wanted: 2 },
      { type: 'escape', text: '离开现场，让通缉清零' },
      { type: 'reach', x: 216, z: 0, radius: 9, text: '回修理站结算', reward: 1500 },
    ] },
];

export const TOTAL_MISSIONS = STORY.length;

export function newProgress() {
  return { job: 0, step: 0, cash: 0, remaining: 0, checkpoint: 0 };
}

export function currentMission(progress) {
  return STORY[progress.job] ?? null;
}

export function currentStep(progress) {
  const mission = currentMission(progress);
  return mission?.steps[progress.step] ?? null;
}

export function stepTarget(progress) {
  const step = currentStep(progress);
  if (!step) return null;
  if (step.type === 'race') {
    return step.points[progress.checkpoint] ?? step.points[step.points.length - 1];
  }
  if (step.type === 'kill') return step.target;
  if (step.type === 'escape') return null;
  return { x: step.x, z: step.z };
}

export function targetDistance(progress, x, z) {
  const target = stepTarget(progress);
  return target ? Math.hypot(x - target.x, z - target.z) : null;
}

function beginStep(progress, step) {
  progress.remaining = step.duration ?? 0;
  progress.checkpoint = 0;
}

function finish(progress, mission, step) {
  const reward = step.reward ?? 0;
  progress.cash += reward;
  progress.step++;
  progress.remaining = 0;
  progress.checkpoint = 0;
  if (progress.step >= mission.steps.length) {
    progress.job++;
    progress.step = 0;
    progress.remaining = 0;
    progress.checkpoint = 0;
    const nextMission = STORY[progress.job] ?? null;
    if (!nextMission) {
      return { type: 'all-complete', reward, mission,
        text: `全部委托完成！+$${reward}` };
    }
    return { type: 'mission-complete', reward, mission, nextMission,
      text: `${mission.title}完成！+$${reward}` };
  }
  const next = mission.steps[progress.step];
  beginStep(progress, next);
  const event = { type: 'objective', reward, mission, step: next, text: next.text };
  if (next.type === 'kill' && next.target) {
    event.spawnTarget = { ...next.target, count: next.count ?? 1 };
  }
  if (next.type === 'rob') event.wanted = next.wanted ?? 2;
  return event;
}

export function acceptMission(progress) {
  const mission = currentMission(progress);
  if (!mission) return null;
  const step = mission.steps[progress.step];
  beginStep(progress, step);
  const event = { type: 'mission-start', mission, step, text: mission.title };
  if (step.type === 'kill' && step.target) {
    event.spawnTarget = { ...step.target, count: step.count ?? 1 };
  }
  return event;
}

export function advanceMission(progress, x, z, dt, context = {}) {
  const mission = currentMission(progress);
  if (!mission) return null;
  const step = mission.steps[progress.step];
  if (!step) return null;

  if (step.type === 'escape') {
    if ((context.wanted ?? 0) <= 0) {
      return { ...finish(progress, mission, { ...step, reward: 0 }),
        text: '通缉解除，继续行动' };
    }
    return null;
  }

  if (step.type === 'kill') {
    if ((context.targetsDead ?? 0) >= (step.count ?? 1)) {
      return finish(progress, mission, step);
    }
    return null;
  }

  if (step.type === 'race') {
    if (step.duration) {
      progress.remaining = Math.max(0, progress.remaining - dt);
      if (progress.remaining === 0) {
        progress.step = 0;
        progress.checkpoint = 0;
        beginStep(progress, mission.steps[0]);
        return { type: 'failed', mission, text: '超时了，回到起点重新挑战' };
      }
    }
    const point = step.points[progress.checkpoint];
    if (point && Math.hypot(x - point.x, z - point.z) < 8.5) {
      progress.checkpoint++;
      if (progress.checkpoint >= step.points.length) return finish(progress, mission, step);
      return { type: 'checkpoint', mission,
        text: `检查点 ${progress.checkpoint}/${step.points.length}` };
    }
    return null;
  }

  if (step.duration) {
    progress.remaining = Math.max(0, progress.remaining - dt);
    if (progress.remaining === 0) {
      progress.step = 0;
      progress.checkpoint = 0;
      beginStep(progress, mission.steps[0]);
      return { type: 'failed', mission, text: '配送超时，回到起点重新接单' };
    }
  }
  if (Math.hypot(x - step.x, z - step.z) > (step.radius ?? 7.5)) return null;

  if (step.type === 'rob') {
    progress.cash += step.reward ?? 0;
    progress.step++;
    beginStep(progress, mission.steps[progress.step]);
    return { type: 'rob', mission, wanted: step.wanted ?? 2, reward: step.reward ?? 0,
      text: `抢到 $${step.reward ?? 0}！快跑，警察来了` };
  }
  return finish(progress, mission, step);
}

export function recoverProgress(value) {
  const fresh = newProgress();
  if (!value || typeof value !== 'object') return fresh;
  const job = Number(value.job);
  const step = Number(value.step);
  const cash = Number(value.cash);
  if (!Number.isInteger(job) || job < 0 || job > STORY.length) return fresh;
  if (!Number.isFinite(cash) || cash < 0 || cash > 2_000_000) return fresh;
  fresh.job = job;
  fresh.cash = Math.floor(cash);
  if (job < STORY.length) {
    const steps = STORY[job].steps;
    fresh.step = Number.isInteger(step) && step >= 0 && step < steps.length ?
      step : 0;
    fresh.remaining = steps[fresh.step].duration ?? 0;
    fresh.checkpoint = 0;
  }
  return fresh;
}
