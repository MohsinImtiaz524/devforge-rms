function startFilesWorker(service) {
  let running=false;
  async function tick(){if(running)return;running=true;try{await service.sweep();}catch{console.error('[Files worker] Processing failed; durable jobs will retry.');}finally{running=false;}}
  const timer=setInterval(tick,require('./files.config').uploadConfig().workerIntervalMs);timer.unref();void tick();return()=>clearInterval(timer);
}
module.exports={startFilesWorker};
