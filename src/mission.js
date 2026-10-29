export const STAGES = [
  { title: '街角的甜点', description: '前往甜甜圈店领取包裹',
    x: 72, z: 72, type: 'pickup', job: 0 },
  { title: '街角的甜点', description: '将包裹送到绿荫公园',
    x: -144, z: 144, type: 'delivery', job: 0, reward: 180, duration: 110 },
  { title: '海风速递', description: '前往游戏厅领取新订单',
    x: -144, z: -144, type: 'pickup', job: 1 },
  { title: '海风速递', description: '赶往海滨舞台完成配送',
    x: 144, z: -144, type: 'delivery', job: 1, reward: 260, duration: 125 },
];

export function newProgress() {
  return { stage: 0, cash: 0, remaining: 0 };
}

export function currentStage(progress) {
  return STAGES[progress.stage] ?? null;
}

export function targetDistance(progress, x, z) {
  const target = currentStage(progress);
  return target ? Math.hypot(x - target.x, z - target.z) : null;
}

export function advanceMission(progress, x, z, dt) {
  const target = currentStage(progress);
  if (!target) return null;
  if (target.type === 'delivery') {
    progress.remaining = Math.max(0, progress.remaining - dt);
    if (progress.remaining === 0) {
      progress.stage--;
      return { type: 'late', text: '送达超时，回到取货地点重新接单' };
    }
  }
  if (targetDistance(progress, x, z) > 7.5) return null;
  progress.stage++;
  if (target.type === 'pickup') {
    progress.remaining = STAGES[progress.stage].duration;
    return { type: 'pickup', text: '领取成功！快把包裹送达' };
  }
  progress.remaining = 0;
  progress.cash += target.reward;
  return { type: progress.stage === STAGES.length ? 'finished' : 'delivery',
    text: progress.stage === STAGES.length ? `城市委托全部完成！+$${target.reward}` : `配送完成！+$${target.reward}` };
}

export function recoverProgress(value) {
  const fresh = newProgress();
  if (!value || typeof value !== 'object') return fresh;
  const stage = Number(value.stage);
  const cash = Number(value.cash);
  const remaining = Number(value.remaining);
  if (!Number.isInteger(stage) || stage < 0 || stage > STAGES.length ||
      !Number.isFinite(cash) || cash < 0 || cash > 1_000_000) return fresh;
  fresh.stage = stage;
  fresh.cash = Math.floor(cash);
  fresh.remaining = stage < STAGES.length && STAGES[stage].type === 'delivery' &&
    Number.isFinite(remaining) ? Math.max(1, Math.min(remaining, STAGES[stage].duration)) : 0;
  return fresh;
}
