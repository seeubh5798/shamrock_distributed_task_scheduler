// src/worker/taskWorker.js
const taskStore = require("../storage/taskStore");

const MAX_CONCURRENT_TASKS = parseInt(process.env.MAX_CONCURRENT_TASKS || "3", 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "1000", 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeTask(task) {
  console.log(`▶️ Starting task ${task.id} (duration ${task.duration_ms} ms)`);

  try {
    await sleep(task.duration_ms);

    await taskStore.completeTask(task.id);
    console.log(`✅ Completed task ${task.id}`);
  } catch (err) {
    console.error(`❌ Error executing task ${task.id}:`, err);
    await taskStore.failTask(task.id, err.message || String(err));
  }
}

async function scheduleAndRunTasks() {
  // Check how many tasks are RUNNING globally (across all workers)
  const runningCount = await taskStore.countRunningTasks();
  if (runningCount >= MAX_CONCURRENT_TASKS) {
    return;
  }

  const availableSlots = MAX_CONCURRENT_TASKS - runningCount;
  if (availableSlots <= 0) return;

  // Claim up to availableSlots tasks
  const tasks = await taskStore.claimRunnableTasks(availableSlots);
  if (!tasks.length) {
    return;
  }

  for (const task of tasks) {
    // Fire and forget: execute task asynchronously
    executeTask(task).catch((err) => {
      console.error("Unexpected error in executeTask:", err);
    });
  }
}

async function workerLoop() {
  while (true) {
    try {
      await scheduleAndRunTasks();
    } catch (err) {
      console.error("Worker loop error:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function startWorker() {
  console.log(
    `🧵 Task worker started (max concurrency = ${MAX_CONCURRENT_TASKS}, poll = ${POLL_INTERVAL_MS}ms)`
  );
  workerLoop().catch((err) => {
    console.error("Fatal worker error:", err);
    process.exit(1);
  });
}

module.exports = { startWorker };
