// src/app.js
const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { connectDb } = require("./config/database");
const taskRoutes = require("./routes/taskRoutes");
const { recoverRunningTasks } = require("./services/taskService");
const { startWorker } = require("./worker/taskWorker");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/tasks", taskRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function bootstrap() {
  await connectDb();
  await recoverRunningTasks();

  app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
  });

  // Start the background worker loop
  startWorker();
}

bootstrap().catch((err) => {
  console.error("Failed to start application:", err);
  process.exit(1);
});
