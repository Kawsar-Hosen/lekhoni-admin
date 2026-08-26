const fs = require('node:fs');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
client.connect()
  .then(() => fs.promises.readFile('db/schema.sql', 'utf8'))
  .then(sql => client.query(sql))
  .then(() => console.log('Lekhoni schema applied to Neon'))
  .finally(() => client.end());
