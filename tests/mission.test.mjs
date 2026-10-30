import assert from 'node:assert/strict';
import test from 'node:test';
import { STORY, acceptMission, advanceMission, newProgress, recoverProgress,
  targetDistance } from '../src/mission.js';

test('first delivery chain rewards cash and advances the story', () => {
  const progress = newProgress();
  assert.equal(targetDistance(progress, 72, 72), 0);
  assert.equal(advanceMission(progress, 0, 0, 0.016), null);
  const pickup = advanceMission(progress, 72, 72, 0.016);
  assert.equal(pickup.type, 'objective');
  assert.equal(progress.step, 1);
  assert.equal(progress.remaining, 110);
  const delivery = advanceMission(progress, -144, 144, 1);
  assert.equal(delivery.type, 'mission-complete');
  assert.equal(progress.cash, 180);
  assert.equal(progress.job, 1);
  assert.equal(progress.step, 0);
});

test('timed delivery expires and restarts from the first step', () => {
  const progress = newProgress();
  advanceMission(progress, 72, 72, 0);
  assert.equal(progress.step, 1);
  const late = advanceMission(progress, -100, -100, 111);
  assert.equal(late.type, 'failed');
  assert.equal(progress.step, 0);
  assert.equal(progress.cash, 0);
});

test('robbery pays, raises heat, and escape resolves to the next step', () => {
  const progress = newProgress();
  progress.job = 2;
  assert.equal(advanceMission(progress, 82, 110, 0.016).type, 'objective');
  const rob = advanceMission(progress, 82, 110, 0.016);
  assert.equal(rob.type, 'rob');
  assert.equal(rob.wanted, 3);
  assert.equal(progress.cash, 450);
  assert.equal(progress.step, 2);
  assert.equal(advanceMission(progress, 0, 0, 0.016, { wanted: 3 }), null);
  const escaped = advanceMission(progress, 0, 0, 0.016, { wanted: 0 });
  assert.equal(escaped.type, 'objective');
  assert.equal(progress.step, 3);
});

test('race checkpoints finish, timeout resets the timer', () => {
  const progress = newProgress();
  progress.job = 3;
  assert.equal(acceptMission(progress).type, 'mission-start');
  assert.equal(progress.remaining, 85);
  for (const point of STORY[3].steps[0].points) {
    assert.ok(advanceMission(progress, point.x, point.z, 0.016));
  }
  assert.equal(progress.cash, 800);
  assert.equal(progress.job, 4);

  const retry = newProgress();
  retry.job = 3;
  acceptMission(retry);
  assert.equal(advanceMission(retry, 0, 0, 86).type, 'failed');
  assert.equal(retry.step, 0);
  assert.equal(retry.remaining, 85);
});

test('kill target then escape completes the whole story', () => {
  const progress = newProgress();
  progress.job = 4;
  const start = acceptMission(progress);
  assert.equal(start.spawnTarget.name, '码头老陈');
  assert.equal(advanceMission(progress, 0, 0, 0.016, { targetsDead: 0 }), null);
  const killed = advanceMission(progress, 0, 0, 0.016, { targetsDead: 1 });
  assert.equal(killed.type, 'objective');
  assert.equal(progress.step, 1);
  assert.ok(advanceMission(progress, 0, 0, 0.016, { wanted: 0 }));
  assert.equal(progress.step, 2);
  const done = advanceMission(progress, 216, 0, 0.016);
  assert.equal(done.type, 'mission-complete');
  assert.equal(progress.cash, 1500);
  assert.equal(progress.job, 5);
});

test('the final mission ends the story', () => {
  const progress = newProgress();
  progress.job = STORY.length - 1;
  acceptMission(progress);
  advanceMission(progress, 216, 216, 0.016);
  advanceMission(progress, 144, 216, 0.016, { targetsDead: 1 });
  advanceMission(progress, 0, 0, 0.016, { wanted: 0 });
  const done = advanceMission(progress, 216, 0, 0.016);
  assert.equal(done.type, 'all-complete');
  assert.equal(progress.job, STORY.length);
});

test('saved progress is validated before restoring', () => {
  assert.deepEqual(recoverProgress({ job: 1, cash: 50 }),
    { job: 1, step: 0, cash: 50, remaining: 0, checkpoint: 0 });
  assert.deepEqual(recoverProgress({ job: -3, cash: 50 }), newProgress());
  assert.deepEqual(recoverProgress({ job: 2, cash: 'oops' }), newProgress());
  const finished = recoverProgress({ job: STORY.length, cash: 440 });
  assert.equal(finished.job, STORY.length);
  assert.equal(finished.cash, 440);
  assert.equal(recoverProgress({ job: 2, step: 9, cash: 10 }).step, 0);
});
