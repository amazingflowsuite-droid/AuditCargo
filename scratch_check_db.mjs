import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
const dbUrl = envFile.split('\n').find(l => l.startsWith('DATABASE_URL')).split('=')[1].trim();

import pg from 'pg';
const { Client } = pg;
const c = new Client({connectionString: dbUrl});
await c.connect();
const r = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'trips'");
console.log(r.rows);
process.exit();
