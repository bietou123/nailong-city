import assert from 'node:assert/strict';
import test from 'node:test';
import { STAGES, advanceMission, currentStage, newProgress, recoverProgress,
  targetDistance } from '../src/mission.js';

test('pickup, delivery, reward, and completion', () => {
  const progress = newProgress();
  assert.equal(targetDistance(progress, 72, 72), 0);
  assert.equal(advanceMission(progress, 0, 0, 0.016), null);
  assert.equal(advanceMission(progress, 72, 72, 0.016).type, 'pickup');
  assert.equal(progress.remaining, 110);
  assert.equal(advanceMission(progress, -144, 144, 1).type, 'delivery');
  assert.equal(progress.cash, 180);
  assert.equal(advanceMission(progress, -144, -144, 0.016).type, 'pickup');
  assert.equal(advanceMission(progress, 144, -144, 1).type, 'finished');
  assert.equal(progress.cash, 440);
  assert.equal(currentStage(progress), null);
});

test('timed delivery expires and returns to pickup', () => {
  const progress = newProgress();
  advanceMission(progress, STAGES[0].x, STAGES[0].z, 0);
  assert.equal(advanceMission(progress, -100, -100, 111).type, 'late');
  assert.equal(progress.stage, 0);
  assert.equal(progress.cash, 0);
});

test('saved progress is validated before restoring', () => {
  assert.deepEqual(recoverProgress({ stage: 1, cash: 50, remaining: 35 }),
    { stage: 1, cash: 50, remaining: 35 });
  assert.deepEqual(recoverProgress({ stage: -3, cash: 50 }), newProgress());
  assert.deepEqual(recoverProgress({ stage: 2, cash: 'oops' }), newProgress());
  assert.equal(recoverProgress({ stage: 4, cash: 440, remaining: 25 }).remaining, 0);
});
