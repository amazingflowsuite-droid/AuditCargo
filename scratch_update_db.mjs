import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
const dbUrl = envFile.split('\n').find(l => l.startsWith('DATABASE_URL')).split('=')[1].trim();

import pg from 'pg';
const { Client } = pg;
const c = new Client({connectionString: dbUrl});
await c.connect();

try {
  // Add columns to senders
  await c.query("ALTER TABLE senders ADD COLUMN IF NOT EXISTS franchise_hours NUMERIC DEFAULT 0;");
  await c.query("ALTER TABLE senders ADD COLUMN IF NOT EXISTS demurrage_hourly_rate NUMERIC DEFAULT 0;");
  
  // Add sender_id to trips
  await c.query("ALTER TABLE trips ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES senders(id) ON DELETE SET NULL;");
  
  console.log("Database schema updated successfully!");
} catch (e) {
  console.error("Error updating schema:", e);
} finally {
  process.exit();
}
