const { Client } = require('pg')
const path = require('path')
const fs = require('fs')

// Lê .env.local
const envPath = path.resolve(__dirname, '.env.local')
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

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    console.log('Conectado para executar a migração SaaS...')

    await client.query('BEGIN;')

    // 1. Tabela organizations
    console.log('1. Criando tabela organizations...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        cnpj TEXT,
        slug TEXT UNIQUE NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `)

    // Inserir organização padrão
    console.log('2. Inserindo organização padrão AuditCargo Matriz...')
    const defaultOrgRes = await client.query(`
      INSERT INTO public.organizations (name, cnpj, slug)
      VALUES ('AuditCargo Matriz', '00.000.000/0001-00', 'auditcargo-matriz')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `)
    const defaultOrgId = defaultOrgRes.rows[0].id
    console.log(`Organização padrão ID: ${defaultOrgId}`)

    // 2. Tabela profiles (vinculada a auth.users e organizations)
    console.log('3. Criando tabela profiles...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
    `)

    // 3. Adicionar organization_id nas tabelas operacionais e associar registros existentes
    const tablesToMigrate = [
      'trips',
      'drivers',
      'senders',
      'recipients',
      'branches',
      'companies',
      'notification_emails'
    ]

    for (const table of tablesToMigrate) {
      console.log(`4. Adicionando organization_id na tabela ${table}...`)
      await client.query(`
        ALTER TABLE public."${table}" 
        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
      `)
      
      // Atualiza registros existentes que estão sem organization_id
      const updateRes = await client.query(`
        UPDATE public."${table}"
        SET organization_id = $1
        WHERE organization_id IS NULL;
      `, [defaultOrgId])
      console.log(`   -> ${updateRes.rowCount} registros atualizados em ${table}`)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_${table}_org" ON public."${table}"(organization_id);
      `)
    }

    await client.query('COMMIT;')
    console.log('✅ Migração SaaS concluída com sucesso no banco de dados!')
  } catch (err) {
    await client.query('ROLLBACK;')
    console.error('❌ Erro na migração (ROLLBACK executado):', err)
  } finally {
    await client.end()
  }
}

runMigration()
