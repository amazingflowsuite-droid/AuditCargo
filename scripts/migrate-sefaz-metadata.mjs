import pg from 'pg'

const DATABASE_URL = 'postgresql://postgres.lpngglwlzepwmbpywhxr:KT6MQ-cwu3J7ZKD@aws-0-us-east-1.pooler.supabase.com:5432/postgres'

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL })
  const client = await pool.connect()

  try {
    console.log('🔄 Verificando coluna sefaz_metadata na tabela trips...')
    await client.query(`
      ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS sefaz_metadata JSONB DEFAULT '{}'::jsonb;
    `)

    console.log('✅ Coluna sefaz_metadata adicionada com sucesso!')
  } catch (err) {
    console.error('❌ Erro na migração:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
