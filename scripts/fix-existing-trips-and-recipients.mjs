import pg from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not defined in .env.local')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

const RECIPIENT_DATA = [
  {
    cnpj: '36.716.865/0001-04',
    cleanCnpj: '36716865000104',
    name: 'RIO ATACADAO ALIMENTOS LTDA',
    city: 'RIO DE JANEIRO',
    uf: 'RJ',
    address: 'AV BRASIL, 19001 - IRAJA',
    zip_code: '21530-000',
    phone: '(21) 2471-5900',
  },
  {
    cnpj: '91.156.471/0014-63',
    cleanCnpj: '91156471001463',
    name: 'IMPORTADORA E EXPORTADORA DE CEREAIS SA',
    city: 'LAJEADO',
    uf: 'RS',
    address: 'ERS-130, 3880 - MOINHOS',
    zip_code: '95900-000',
    phone: null,
  },
  {
    cnpj: '05.383.731/0004-20',
    cleanCnpj: '05383731000420',
    name: 'CHOKDOCE COMERCIO DE PRODUTOS ALIMENTICIOS LTDA',
    city: 'FRANCA',
    uf: 'SP',
    address: 'RUA PRUDENTE DE MORAIS, 1177 - CIDADE NOVA',
    zip_code: '14401-100',
    phone: null,
  },
  {
    cnpj: '93.015.006/0014-38',
    cleanCnpj: '93015006001438',
    name: 'COMPANHIA ZAFFARI COMERCIO E INDUSTRIA',
    city: 'PORTO ALEGRE',
    uf: 'RS',
    address: 'RUA ANTONIO ZAFFARI, 100 - JAR SAO PEDRO',
    zip_code: '91420-000',
    phone: null,
  },
]

async function run() {
  const client = await pool.connect()
  try {
    console.log('Connected to Supabase PostgreSQL database.')

    // 1. Get organization_id and company_id
    const orgRes = await client.query('SELECT organization_id, company_id FROM trips LIMIT 1')
    const orgId = orgRes.rows[0]?.organization_id
    const companyId = orgRes.rows[0]?.company_id
    console.log('Org ID:', orgId, 'Company ID:', companyId)

    // 2. Insert / Upsert Recipients into `recipients` table
    for (const rec of RECIPIENT_DATA) {
      const existing = await client.query(
        `SELECT id FROM recipients 
         WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 
           AND organization_id = $2`,
        [rec.cleanCnpj, orgId]
      )
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO recipients (name, cnpj, city, address, zip_code, phone, organization_id, company_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [rec.name, rec.cnpj, rec.city, rec.address, rec.zip_code, rec.phone, orgId, companyId]
        )
        console.log(`Inserted recipient: ${rec.name} (${rec.cnpj})`)
      } else {
        await client.query(
          `UPDATE recipients 
           SET name = $1, city = $2, address = $3, zip_code = $4, phone = COALESCE(phone, $5)
           WHERE id = $6`,
          [rec.name, rec.city, rec.address, rec.zip_code, rec.phone, existing.rows[0].id]
        )
        console.log(`Updated recipient: ${rec.name} (${rec.cnpj})`)
      }
    }

    // 3. Update the 4 existing trips
    const tripsRes = await client.query(`SELECT id, token, cte_number, recipients, sefaz_metadata FROM trips WHERE organization_id = $1`, [orgId])
    console.log(`Found ${tripsRes.rows.length} trips in organization.`)

    for (const trip of tripsRes.rows) {
      let meta = trip.sefaz_metadata || {}
      let updatedRecipients = Array.isArray(trip.recipients) ? [...trip.recipients] : []
      let newDestination = trip.destination

      if (meta.ctes && Array.isArray(meta.ctes)) {
        meta.ctes = meta.ctes.map((c) => {
          const cleanDest = (c.destCnpj || '').replace(/\D/g, '')
          const match = RECIPIENT_DATA.find((r) => r.cleanCnpj === cleanDest)
          if (match) {
            c.destNome = match.name
            c.destCidade = match.city
            c.destUf = match.uf
            newDestination = `${match.city}/${match.uf}`
          }
          c.remNome = 'INTERBRANDS FOODS LTDA'
          c.remCnpj = '00.288.948/0005-18'
          c.remCidade = 'MAUA'
          c.remUf = 'SP'
          return c
        })
      }

      updatedRecipients = updatedRecipients.map((rec) => {
        const cleanDest = (rec.cnpj || '').replace(/\D/g, '')
        const match = RECIPIENT_DATA.find((r) => r.cleanCnpj === cleanDest)
        if (match) {
          rec.name = match.name
          rec.destination = `${match.city}/${match.uf}`
        }
        return rec
      })

      meta.sender_name = 'INTERBRANDS FOODS LTDA'
      meta.sender_cnpj = '00.288.948/0005-18'
      meta.sender_city = 'MAUA'
      meta.sender_uf = 'SP'
      meta.destination_city = newDestination || meta.destination_city

      await client.query(
        `UPDATE trips 
         SET destination = $1,
             recipients = $2,
             sefaz_metadata = $3
         WHERE id = $4`,
        [newDestination, JSON.stringify(updatedRecipients), JSON.stringify(meta), trip.id]
      )
      console.log(`Updated trip ${trip.token} (${trip.cte_number}) -> Destination: ${newDestination}`)
    }

    console.log('Migration completed successfully!')
  } catch (err) {
    console.error('Migration error:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
