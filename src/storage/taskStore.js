// src/storage/taskStore.js
const { pool } = require("../config/database");

// Insert a new task
async function insertTask({ id, type, duration_ms, dependencies = [] }) {
  const text = `
    INSERT INTO tasks (id, type, duration_ms, dependencies, status)
    VALUES ($1, $2, $3, $4, 'QUEUED')
    RETURNING *;
  `;
  const values = [id, type, duration_ms, dependencies];
  const { rows } = await pool.query(text, values);
  return rows[0];
}

// Get one task
async function getTaskById(id) {
  const { rows } = await pool.query(
    "SELECT * FROM tasks WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

// List all tasks
async function getAllTasks() {
  const { rows } = await pool.query(
    "SELECT * FROM tasks ORDER BY created_at DESC"
  );
  return rows;
}

// On startup: reset RUNNING → QUEUED (crash recovery)
async function resetRunningTasksToQueued() {
  const { rowCount } = await pool.query(
    `UPDATE tasks
       SET status = 'QUEUED',
           updated_at = NOW(),
           last_error = NULL
     WHERE status = 'RUNNING'`
  );
  if (rowCount > 0) {
    console.log(`🔄 Recovery: reset ${rowCount} RUNNING tasks back to QUEUED`);
  }
}

// Count how many tasks are currently RUNNING
async function countRunningTasks() {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM tasks WHERE status = 'RUNNING'"
  );
  return rows[0].count;
}

/**
 * Claim up to `limit` runnable tasks:
 * - status = 'QUEUED'
 * - all dependencies are COMPLETED
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to avoid double-pick.
 */
async function claimRunnableTasks(limit) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const selectText = `
      SELECT t.id, t.type, t.duration_ms
      FROM tasks t
      WHERE t.status = 'QUEUED'
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(t.dependencies) AS dep_id
          JOIN tasks dep ON dep.id = dep_id
          WHERE dep.status <> 'COMPLETED'
        )
      ORDER BY t.created_at
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `;

    const readyRes = await client.query(selectText, [limit]);
    const tasks = readyRes.rows;

    if (tasks.length === 0) {
      await client.query("COMMIT");
      return [];
    }

    const ids = tasks.map((t) => t.id);

    const updateText = `
      UPDATE tasks
      SET status = 'RUNNING',
          updated_at = NOW(),
          last_error = NULL
      WHERE id = ANY($1::text[]);
    `;
    await client.query(updateText, [ids]);

    await client.query("COMMIT");
    return tasks;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Mark task as COMPLETED (only if still RUNNING)
async function completeTask(id) {
  await pool.query(
    `
    UPDATE tasks
    SET status = 'COMPLETED',
        updated_at = NOW(),
        last_error = NULL
    WHERE id = $1 AND status = 'RUNNING'
  `,
    [id]
  );
}

// Mark task as FAILED
async function failTask(id, errorMessage) {
  await pool.query(
    `
    UPDATE tasks
    SET status = 'FAILED',
        updated_at = NOW(),
        last_error = $2
    WHERE id = $1
  `,
    [id, errorMessage]
  );
}

module.exports = {
  insertTask,
  getTaskById,
  getAllTasks,
  resetRunningTasksToQueued,
  countRunningTasks,
  claimRunnableTasks,
  completeTask,
  failTask
};
