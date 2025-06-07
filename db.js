// db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Adicionado para suportar SSL no Render
});

pool.on('connect', () => {
  console.log('✅ Conectado ao PostgreSQL com sucesso');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
