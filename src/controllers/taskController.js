// src/controllers/taskController.js
const taskService = require("../services/taskService");

exports.submitTask = async (req, res) => {
  const task = await taskService.submitTask(req.body);
  res.status(201).json(task);
};

exports.getTask = async (req, res) => {
  const task = await taskService.getTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(task);
};

exports.getTaskStatus = async (req, res) => {
  const taskStatus = await taskService.getTaskStatus(req.params.id);
  if (!taskStatus) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(taskStatus);
};

exports.listTasks = async (req, res) => {
  const tasks = await taskService.listTasks();
  res.json(tasks);
};
