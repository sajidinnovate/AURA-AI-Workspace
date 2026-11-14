const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || process.env.PGUSER || 'postgres',
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  database: process.env.DB_NAME || process.env.PGDATABASE || 'enterprise_ai_db',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30000,
  max: 20,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database connection pool error:', err.message);
});

module.exports = pool;
