// src/routes/taskRoutes.js
const express = require("express");
const router = express.Router();
const taskController = require("../controllers/taskController");

// Submit Task
router.post("/", taskController.submitTask);

// Get full task (including dependencies)
router.get("/:id", taskController.getTask);

// Get task status only
router.get("/:id/status", taskController.getTaskStatus);

// List all tasks
router.get("/", taskController.listTasks);

module.exports = router;
