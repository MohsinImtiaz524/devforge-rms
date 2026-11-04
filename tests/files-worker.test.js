const test = require('node:test');
const assert = require('node:assert/strict');
const { startFilesWorker } = require('../src/modules/files/files.worker');
function harness(service) {
  let clock = 0, listener;
  const timers = new Set();
  service.nextJobAt ||= async () => null;
  service.onWork = callback => { listener = callback; return () => { listener = null; }; };
  const stop = startFilesWorker(service, {
    config: { workerIntervalMs: 5000, cleanupIntervalMs: 3600000 },
    now: () => clock,
    setTimeout: (callback, delay) => { const task = { callback, delay, at: clock + delay }; timers.add(task); return task; },
    clearTimeout: task => timers.delete(task),
  });
  return { stop, wake: () => listener?.(), timers: () => [...timers].sort((a,b)=>a.at-b.at),
    async run() { const task = this.timers()[0]; assert.ok(task); timers.delete(task); clock = task.at; task.callback(); await new Promise(resolve => setImmediate(resolve)); } };
}
test('an empty queue has only an hourly cleanup timer, with no recovery polling', async () => {
  let cleanup = 0, reads = 0;
  const h = harness({ cleanup: async () => { cleanup++; }, processDueJobs: async () => { reads++; return 0; } });
  await h.run(); assert.equal(cleanup, 1); assert.equal(reads, 1);
  assert.deepEqual(h.timers().map(t=>t.delay), [3600000]);
  h.wake(); assert.equal(h.timers()[0].delay, 0); await h.run();
  assert.equal(reads, 2); assert.equal(cleanup, 1); assert.equal(h.timers().length, 1);
  h.stop(); assert.equal(h.timers().length, 0);
});
test('a known durable retry schedules its actual deadline and then stops when empty', async () => {
  let due = 30000;
  const h = harness({ cleanup: async () => {}, processDueJobs: async () => 0, nextJobAt: async () => due });
  await h.run(); assert.equal(h.timers()[0].delay, 30000);
  due = null; await h.run(); assert.equal(h.timers().length, 1); assert.equal(h.timers()[0].delay, 3600000);
  h.stop();
});
test('work arriving during processing is not lost and processing never overlaps', async () => {
  let release, calls = 0;
  const h = harness({ cleanup: async () => {}, processDueJobs: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  await h.run(); h.wake(); h.wake(); assert.equal(calls, 1); assert.equal(h.timers().length, 1);
  release(0); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.timers()[0].delay, 0);
  await h.run(); assert.equal(calls, 2); h.stop(); release(0);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.timers().length, 0);
});
test('full batches drain promptly; actual failures retry without a busy loop', async () => {
  const h = harness({ cleanup: async () => {}, processDueJobs: async () => 10 });
  await h.run(); assert.equal(h.timers()[0].delay, 0); h.stop();
  const failed = harness({ cleanup: async () => { throw new Error('offline'); }, processDueJobs: async () => 0 });
  await failed.run(); assert.equal(failed.timers()[0].delay, 5000);
  await failed.run(); assert.equal(failed.timers()[0].delay, 10000); failed.stop();
});
test('hourly cleanup remains scheduled independently of job deadlines', async () => {
  let cleanup = 0;
  const h = harness({ cleanup: async () => { cleanup++; }, processDueJobs: async () => 0 });
  await h.run(); await h.run(); await h.run(); assert.equal(cleanup, 2);
  assert.deepEqual(h.timers().map(t=>t.delay), [3600000]); h.stop();
});
