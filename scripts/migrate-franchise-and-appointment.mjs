import pg from 'pg'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL=')).replace('DATABASE_URL=', '').trim()
const pool = new pg.Pool({ connectionString: dbUrl })

async function run() {
  const client = await pool.connect()
  try {
    console.log('🔄 Executando migração de agendamento e franquia por tipo de veículo...')

    // 1. Tabela recipients: flag de regra de agendamento e observações/janela
    await client.query(`
      ALTER TABLE public.recipients
      ADD COLUMN IF NOT EXISTS has_appointment_rule BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS appointment_notes TEXT;
    `)
    console.log('✅ Colunas has_appointment_rule e appointment_notes adicionadas em recipients!')

    // 2. Tabela senders: tabela detalhada de franquias por tipo de veículo
    await client.query(`
      ALTER TABLE public.senders
      ADD COLUMN IF NOT EXISTS vehicle_franchises JSONB DEFAULT '[]'::jsonb;
    `)
    console.log('✅ Coluna vehicle_franchises adicionada em senders!')

    console.log('🎉 Migração concluída com sucesso!')
  } catch (err) {
    console.error('❌ Erro na migração:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(console.error)
