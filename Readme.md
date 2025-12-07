Distributed Task Scheduler – Backend Service

This project is a backend-only microservice that implements a lightweight, persistent, dependency-aware task orchestration engine (a simplified version of Airflow / Celery).

It supports:

Submitting tasks via REST API

Executing tasks with a global concurrency limit

Dependency-aware scheduling (DAG-style)

Persistent task state stored in PostgreSQL (Neon.tech)

Crash recovery (unfinished tasks are re-queued)

A background worker that continuously processes runnable tasks

📦 Tech Stack

Node.js + Express
PostgreSQL (Neon.tech)
pg (Node Postgres client)
nodemon (for local development)

Project Structure
backend/
 ├── package.json
 ├── .env
 └── src/
       ├── app.js
       ├── config/
       │     └── database.js
       ├── routes/
       │     └── taskRoutes.js
       ├── controllers/
       │     └── taskController.js
       ├── services/
       │     └── taskService.js
       ├── storage/
       │     └── taskStore.js
       ├── worker/
       │     └── taskWorker.js
       └── utils/
             └── asyncHandler.js

🚀 Getting Started (How to Start the Server)
Step 1 – Install dependencies
npm install

Step 2 – Create .env file
Create a .env file in the project root:
DATABASE_URL=postgres://user:password@hostname/dbname
PORT=4000
MAX_CONCURRENT_TASKS=3
POLL_INTERVAL_MS=1000


DATABASE_URL – Neon/Postgres connection string
PORT – HTTP server port (default 4000)
MAX_CONCURRENT_TASKS – max number of tasks allowed to run in parallel
POLL_INTERVAL_MS – how frequently the worker polls for runnable tasks

Step 3 – Initialize the database schema
Run this SQL in our Neon/Postgres console:

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  dependencies TEXT[] DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'QUEUED',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  last_error   TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

Step 4 – Start the backend server
npm run dev

This will:
Start the Express HTTP API on PORT
Start the background worker loop that schedules and executes tasks

API Endpoints
1. Submit Task
POST /api/tasks
Body type - application/json

Request body example:

{
  "id": "task-A",
  "type": "data_processing",
  "duration_ms": 5000,
  "dependencies": []
}
Example Request Body (task depending on another task):
{
  "id": "task-B",
  "type": "aggregation",
  "duration_ms": 5000,
  "dependencies": ["task-A"]
}

Example Request Body (task with multiple dependencies):
{
  "id": "task-C",
  "type": "report_generation",
  "duration_ms": 7000,
  "dependencies": ["task-A", "task-B"]
}

2. Get Task Details
GET /api/tasks/:id
Returns full task details including type, duration, dependencies, status, and timestamps.

3. Get Task Status
GET /api/tasks/:id/status
Response example:

{
  "id": "task-A",
  "status": "RUNNING"
}

4. List All Tasks
GET /api/tasks
Returns an array of all tasks with their states.

🧠 Design Choices
1. Concurrency Model
The system enforces a global concurrency limit using the database.
First, it counts how many tasks are currently running:

SELECT COUNT(*) FROM tasks WHERE status = 'RUNNING';

If the count is less than MAX_CONCURRENT_TASKS, the worker attempts to claim more runnable tasks.

All workers (if we run more than one instance) read the same state from the database, so concurrency is enforced globally, not just per process.

This approach:
Avoids in-memory counters that would be lost on crash
Keeps concurrency rules consistent across multiple instances

2. Safe Task Selection (Race-Free Scheduling)

To prevent multiple workers from executing the same task, the worker uses PostgreSQL row-level locking:

SELECT ...
FROM tasks t
WHERE t.status = 'QUEUED'
  AND <dependencies-are-complete-condition>
FOR UPDATE SKIP LOCKED
LIMIT $1;


The key part is:
FOR UPDATE SKIP LOCKED

This ensures:
Only one worker can lock and update a specific task row
Other workers skip already locked rows and pick another task
No double execution, even if many worker processes are running


3. Dependency Resolution (DAG Execution Model)
Each task declares an array of dependency task IDs in dependencies.
A task is runnable only when all its dependencies are COMPLETED.
This is enforced in SQL:

NOT EXISTS (
  SELECT 1
  FROM unnest(t.dependencies) AS dep_id
  JOIN tasks dep ON dep.id = dep_id
  WHERE dep.status <> 'COMPLETED'
)


So for any task t:
If even one dependency is not COMPLETED, the task remains QUEUED/waiting
If dependencies is empty, the task is immediately eligible (subject to concurrency limit)
This gives us DAG-style execution without building an explicit in-memory graph.

4. Storage Strategy (PostgreSQL / Neon.tech)
All task state is persisted in Postgres:
id, type, duration_ms
dependencies
status (QUEUED, RUNNING, COMPLETED, FAILED)
last_error
timestamps

Reasons for this strategy:
Durability – tasks survive process restarts and crashes
Observability – we can inspect and debug tasks directly in SQL
Locking semantics – Postgres provides row-level locks used for safe scheduling

No in-memory-only queues are used for state; they would be lost on restart.

5. Crash Recovery

If the process crashes while tasks are executing, some tasks may stay marked as RUNNING even though they never completed.
On application startup, we run:
UPDATE tasks
SET status = 'QUEUED'
WHERE status = 'RUNNING';


This ensures:
Tasks that were mid-execution are re-queued
No task is left indefinitely in RUNNING state
The system can safely “pick up where it left off” after a crash

📈 Scaling Strategy – Handling 1 Million Tasks per Hour

If the workload grows significantly, here is how this design can scale.
1. Horizontal Scaling (Multiple Worker Instances)
Because scheduling uses:

FOR UPDATE SKIP LOCKED

We can safely run multiple instances of the backend/worker (e.g., behind a load balancer or in multiple containers).

Example with PM2:
pm2 start src/app.js -i max

All instances:
Compete for tasks in the same database
Never pick the same task twice
Respect the same global MAX_CONCURRENT_TASKS configuration

2. Table Partitioning / Sharding

At very high volumes, the tasks table can become huge.
Approach:
Partition by time (for example):
tasks_2025_0
tasks_2025_02
tasks_2025_03

Or partition by tenant / system / task type.
Benefits:
Smaller indexes
Faster scans
Easier cleanup / archival per partition

3. Message Queue Integration (Optional)

For extreme ingestion rates (e.g., 1M tasks/hour), a message queue can be introduced:
Kafka
RabbitMQ

Typical pattern:
Producers push task definitions into the queue
Worker processes consume from the queue
Confirmed tasks are persisted in Postgres for state tracking
Database then focuses on state, while the queue focuses on throughput.

4. Offloading CPU-Heavy Work

Right now, a task “executes” by sleeping for duration_ms.
If in the future tasks perform heavy CPU work (e.g., large computation):

We cna use Node.js Worker Threads to run CPU-bound code on separate threads
Or use external compute microservices (Go, Rust, Python) that are triggered by the scheduler and report back completion status
This keeps the Node.js event loop responsive and the scheduler fast.


## Screenshot – HLD diagram and Worker Scheduling Logic

![HLD Diagram](./Highlevel_HLD_diagram.png)
![Worker scheduling logic](./worker_scheduling_logic_flow.png)