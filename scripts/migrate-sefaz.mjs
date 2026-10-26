import fs from 'fs'
import path from 'path'
import pg from 'pg'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.resolve(__dirname, '../.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const dbUrl = envContent
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL'))
  .split('=')[1]
  .trim()

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
})

async function migrate() {
  await client.connect()
  console.log('🔌 Conectado ao banco de dados...')

  const sql = `
    CREATE TABLE IF NOT EXISTS sefaz_sync_state (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      cnpj TEXT NOT NULL,
      last_nsu TEXT NOT NULL DEFAULT '000000000000000',
      max_nsu TEXT NOT NULL DEFAULT '000000000000000',
      last_sync_at TIMESTAMPTZ,
      status TEXT DEFAULT 'idle',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(organization_id, cnpj)
    );

    ALTER TABLE trips ADD COLUMN IF NOT EXISTS cte_key TEXT;
    CREATE INDEX IF NOT EXISTS idx_trips_cte_key ON trips(cte_key);
  `

  await client.query(sql)
  console.log('✅ Migração executada com sucesso: Tabela sefaz_sync_state e coluna trips.cte_key prontas!')
  await client.end()
}

migrate().catch((err) => {
  console.error('❌ Erro na migração:', err)
  process.exit(1)
})
