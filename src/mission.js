export const STORY = [
  { id: 'fixup', letter: 'Q', title: '第一单', giver: '小七', color: '#ffd064',
    intro: '车行今天没活儿，帮我跑一趟腿，钱不会少你的。',
    outro: '干得不错。往后有活儿，我第一个想到你。',
    steps: [
      { type: 'reach', x: 72, z: 72, radius: 8, text: '去甜甜圈店把货取回来' },
      { type: 'reach', x: -144, z: 144, radius: 8, text: '把货送到绿荫公园',
        duration: 110, reward: 180 },
    ] },
  { id: 'express', letter: 'W', title: '海风速递', giver: '阿飞', color: '#69c4c8',
    intro: '游戏厅那帮人订的货没人敢送，你去接，出了事算我的。',
    outro: '敢跑夜路的人不多，你算一个。',
    steps: [
      { type: 'reach', x: -144, z: -144, radius: 8, text: '去海风游戏厅接订单' },
      { type: 'reach', x: 144, z: -144, radius: 8, text: '送到海滨舞台',
        duration: 125, reward: 260 },
    ] },
  { id: 'heist', letter: 'M', title: '便利店风云', giver: '老K', color: '#7fd4a2',
    intro: '这店欠保护费欠了三个月，收上来，别客气。',
    outro: '钱我数过了，一分不少。你有种。',
    steps: [
      { type: 'reach', x: 82, z: 110, radius: 9, text: '去 24/7 便利店找店长' },
      { type: 'rob', x: 82, z: 110, radius: 9, text: '把收银台的钱全部收走',
        reward: 450, wanted: 3 },
      { type: 'escape', text: '甩掉警察，让通缉清零' },
      { type: 'reach', x: -144, z: 144, radius: 8, text: '把钱送到绿荫公园交账',
        reward: 620 },
    ] },
  { id: 'race', letter: 'R', title: '夜路狂飙', giver: '小美', color: '#ff9b6a',
    intro: '今晚的赌注很大，别让我输。',
    outro: '你踩油门的样子，挺好看的。',
    steps: [
      { type: 'race', text: '限时冲过全部检查点', duration: 85, reward: 800,
        points: [{ x: 144, z: 72 }, { x: 144, z: 216 }, { x: 216, z: 216 },
          { x: 216, z: 144 }, { x: 216, z: -36 }] },
    ] },
  { id: 'revenue', letter: 'A', title: '最后的账', giver: '阿呆', color: '#ff6f6a',
    intro: '码头老陈吞了我们一批货，把他的人一起清掉。',
    outro: '账清了。这城市现在有一半是你的。',
    steps: [
      { type: 'kill', text: '解决码头的目标人物',
        target: { x: -216, z: -144, name: '码头老陈' }, count: 1, wanted: 2 },
      { type: 'escape', text: '离开现场，让通缉清零' },
      { type: 'reach', x: 216, z: 0, radius: 9, text: '回修理站结账', reward: 1500 },
    ] },
  { id: 'turf', letter: 'T', title: '地盘清场', giver: '阿呆', color: '#c98bff',
    intro: '北街那帮人三个月没收过保护费了，去把场子拿回来。',
    outro: '北街归我们了。这条街从此姓奶。',
    steps: [
      { type: 'kill', text: '清掉北街的两个看场子的人',
        target: { x: -144, z: -72, name: '北街看场的' }, count: 2, wanted: 3 },
      { type: 'escape', text: '警察上来了，先把通缉甩掉' },
      { type: 'reach', x: 216, z: 0, radius: 9, text: '回修理站报账', reward: 1200 },
    ] },
  { id: 'escort', letter: 'E', title: '深夜护送', giver: '小七', color: '#8ad2ff',
    intro: '有个客人今晚必须安全到海边，路上别停。',
    outro: '客人很满意。这份人情我记下了。',
    steps: [
      { type: 'reach', x: -216, z: 72, radius: 8, text: '去西门接上客人' },
      { type: 'reach', x: 216, z: -216, radius: 8, text: '在天亮前送到海边',
        duration: 95, reward: 900 },
    ] },
  { id: 'throne', letter: 'K', title: '王座', giver: '大橙子', color: '#ff5f5f',
    intro: '最后一个人挡在王座上。今晚之后，没有人敢再收你的钱。',
    outro: '从今天起，这座城市的规矩你说了算。',
    steps: [
      { type: 'reach', x: 216, z: 216, radius: 9, text: '去城北的顶层公寓' },
      { type: 'kill', text: '解决城北头目',
        target: { x: 144, z: 216, name: '城北头目' }, count: 1, wanted: 4 },
      { type: 'escape', text: '整座城市的警察都出动了' },
      { type: 'reach', x: 216, z: 0, radius: 9, text: '回修理站坐上王座', reward: 3000 },
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
      return { type: 'failed', mission, text: '时间到了，回去重新接单' };
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
