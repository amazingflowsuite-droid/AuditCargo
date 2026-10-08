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

async function runSenderEmailMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    console.log('📡 Conectado ao PostgreSQL para migração do e-mail do remetente...')

    await client.query('BEGIN;')

    // 1. Coluna email na tabela senders
    console.log('1. Adicionando coluna email na tabela senders...')
    await client.query(`
      ALTER TABLE public.senders
      ADD COLUMN IF NOT EXISTS email TEXT;
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_senders_email ON public.senders(email);
    `)

    // 2. Coluna sender_email na tabela trips
    console.log('2. Adicionando coluna sender_email na tabela trips...')
    await client.query(`
      ALTER TABLE public.trips
      ADD COLUMN IF NOT EXISTS sender_email TEXT;
    `)

    await client.query('COMMIT;')
    console.log('✅ Migração do e-mail de remetente aplicada com sucesso!')
  } catch (err) {
    await client.query('ROLLBACK;')
    console.error('❌ Erro na migração (ROLLBACK executado):', err)
  } finally {
    await client.end()
  }
}

runSenderEmailMigration()
