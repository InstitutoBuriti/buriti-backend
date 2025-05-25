// db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('✅ Conectado ao PostgreSQL com sucesso');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};

