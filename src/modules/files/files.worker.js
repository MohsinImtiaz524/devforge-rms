let workerStatus = { started: false, running: false, mode: 'event-driven', lastCompletedAt: null, lastErrorAt: null, nextJobAt: null, lastCleanupAt: null };
function getFilesWorkerStatus() { return { ...workerStatus }; }
// Empty queues have no recovery timer. Only committed work, known deadlines,
// startup, and the separate cleanup schedule can wake this worker.
function startFilesWorker(service, options = {}) {
  workerStatus = { started: true, running: false, mode: 'event-driven', lastCompletedAt: null, lastErrorAt: null, nextJobAt: null, lastCleanupAt: null };
  const config = options.config || require('./files.config').uploadConfig();
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const now = options.now || Date.now;
  let running = false, stopped = false, requested = false, timer;
  let cleanupRequested = true, cleanupTimer;
  let errorDelay = config.workerIntervalMs;

  function arm(delay) {
    if (stopped) return;
    if (timer) cancel(timer);
    workerStatus.nextJobAt = new Date(now() + Math.max(0, delay)).toISOString();
    timer = schedule(() => { timer = null; void require('../request-monitor/request-monitor.service').monitor.runContext('FilesWorker.tick', tick); }, Math.min(2147483647, Math.max(0, delay)));
    timer.unref?.();
  }
  function wake() {
    if (stopped) return;
    if (running) requested = true;
    else arm(0);
  }
  function scheduleCleanup() {
    if (stopped) return;
    cleanupTimer = schedule(() => {
      cleanupTimer = null;
      cleanupRequested = true;
      wake();
    }, config.cleanupIntervalMs);
    cleanupTimer.unref?.();
  }
  async function tick() {
    if (stopped || running) return;
    running = true; workerStatus.running = true; workerStatus.nextJobAt = null;
    let delay = null;
    try {
      if (cleanupRequested) {
        await service.cleanup();
        workerStatus.lastCleanupAt = new Date(now()).toISOString();
        cleanupRequested = false;
        scheduleCleanup();
      }
      const count = await service.processDueJobs();
      if (count === 10) delay = 0;
      else {
        const dueAt = await service.nextJobAt();
        if (dueAt !== null) delay = Math.max(0, dueAt - now());
      }
      workerStatus.lastCompletedAt = new Date(now()).toISOString();
      errorDelay = config.workerIntervalMs;
    } catch {
      workerStatus.lastErrorAt = new Date(now()).toISOString();
      // Retry an actual failed operation, never poll an empty queue.
      console.error('[Files worker] Processing failed; durable work will retry.');
      delay = errorDelay;
      errorDelay = Math.min(60000, errorDelay * 2);
    } finally {
      running = false; workerStatus.running = false;
      if (requested) { requested = false; delay = 0; }
      if (delay !== null) arm(delay);
    }
  }
  const unsubscribe = service.onWork(wake);
  arm(0);
  return () => {
    stopped = true; workerStatus.started = false; workerStatus.nextJobAt = null;
    if (timer) cancel(timer);
    if (cleanupTimer) cancel(cleanupTimer);
    unsubscribe();
  };
}
module.exports = { startFilesWorker, getFilesWorkerStatus };
