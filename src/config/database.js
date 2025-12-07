// src/config/database.js
const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function connectDb() {
  try {
    await pool.query("SELECT 1");
    console.log("DB Connected Successfully");
  } catch (err) {
    console.error("DB Connection Error:", err);
    process.exit(1);
  }
}

module.exports = { pool, connectDb };
