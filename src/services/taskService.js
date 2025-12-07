// src/services/taskService.js
const taskStore = require("../storage/taskStore");

async function submitTask(payload) {
  const { id, type, duration_ms, dependencies } = payload;

  if (!id || typeof id !== "string") {
    throw new Error("Task 'id' is required (string)");
  }
  if (!type || typeof type !== "string") {
    throw new Error("Task 'type' is required (string)");
  }
  if (typeof duration_ms !== "number" || duration_ms <= 0) {
    throw new Error("Task 'duration_ms' must be a positive number");
  }
  if (dependencies && !Array.isArray(dependencies)) {
    throw new Error("Task 'dependencies' must be an array of task IDs");
  }

  const task = await taskStore.insertTask({
    id,
    type,
    duration_ms,
    dependencies: dependencies || []
  });

  return task;
}

async function getTask(id) {
  const task = await taskStore.getTaskById(id);
  return task;
}

async function getTaskStatus(id) {
  const task = await taskStore.getTaskById(id);
  if (!task) return null;
  return { id: task.id, status: task.status };
}

async function listTasks() {
  return taskStore.getAllTasks();
}

async function recoverRunningTasks() {
  await taskStore.resetRunningTasksToQueued();
}

module.exports = {
  submitTask,
  getTask,
  getTaskStatus,
  listTasks,
  recoverRunningTasks
};
