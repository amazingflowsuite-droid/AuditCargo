import { Client } from 'pg'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Lê .env.local
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim()
      let val = trimmed.substring(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1)
      }
      process.env[key] = val
    }
  })
}

async function runTelegramMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    console.log('📡 Conectado ao PostgreSQL para migração do Telegram...')

    await client.query('BEGIN;')

    // 1. Colunas na tabela drivers
    console.log('1. Adicionando campos de Telegram na tabela drivers...')
    await client.query(`
      ALTER TABLE public.drivers
      ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
      ADD COLUMN IF NOT EXISTS telegram_username TEXT;
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_drivers_telegram_chat_id ON public.drivers(telegram_chat_id);
    `)

    // 2. Colunas na tabela trips
    console.log('2. Adicionando campos de Telegram, GPS e Comprovante na tabela trips...')
    await client.query(`
      ALTER TABLE public.trips
      ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
      ADD COLUMN IF NOT EXISTS last_driver_latitude NUMERIC,
      ADD COLUMN IF NOT EXISTS last_driver_longitude NUMERIC,
      ADD COLUMN IF NOT EXISTS delivery_receipt_url TEXT;
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trips_telegram_chat_id ON public.trips(telegram_chat_id);
    `)

    await client.query('COMMIT;')
    console.log('✅ Migração do Telegram aplicada com sucesso!')
  } catch (err) {
    await client.query('ROLLBACK;')
    console.error('❌ Erro na migração do Telegram (ROLLBACK executado):', err)
  } finally {
    await client.end()
  }
}

runTelegramMigration()
