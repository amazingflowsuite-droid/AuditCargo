import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Carrega variáveis de ambiente do .env.local sem dependências externas
const envLocalPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
}

async function run() {
  console.log('🚀 Iniciando teste de Ingestão de Manifesto SSW com Mock...')

  // Lê o mock oficial
  const mockPath = path.resolve(__dirname, '../src/utils/ssw/mock-manifesto.json')
  const mockData = JSON.parse(fs.readFileSync(mockPath, 'utf8'))

  // Altera ligeiramente o identificador para cada execução gerar uma viagem nova de teste
  const randomSuffix = Math.floor(1000 + Math.random() * 9000)
  mockData.manifestoSSW = `SSW TESTE-${randomSuffix}`
  mockData.nroMDFe = randomSuffix

  console.log(`📦 Processando Manifesto: ${mockData.manifestoSSW}`)
  console.log(`🚚 Motorista: ${mockData.motorista.nome} (CPF: ${mockData.motorista.cpf})`)
  console.log(`📋 Total de CT-es no manifesto: ${mockData.ctes.length}`)

  // Importa dinamicamente o serviço compilado / módulo
  const { processSSWManifesto } = await import('../src/utils/ssw/manifesto-service.ts')

  // 1ª Execução: Inserção
  console.log('\n--- [TESTE 1] Ingestão inicial do manifesto ---')
  const res1 = await processSSWManifesto(mockData)
  console.log('Resultado da Ingestão:', JSON.stringify(res1, null, 2))

  if (!res1.sucesso) {
    console.error('❌ Teste 1 falhou!')
    process.exit(1)
  }

  // 2ª Execução: Teste de Idempotência
  console.log('\n--- [TESTE 2] Teste de Idempotência (mesmo manifesto) ---')
  const res2 = await processSSWManifesto(mockData)
  console.log('Resultado da Re-ingestão:', JSON.stringify(res2, null, 2))

  if (res2.sucesso && res2.protocolo === res1.protocolo) {
    console.log('✅ Idempotência validada com sucesso! Mesmo protocolo retornado.')
  } else {
    console.error('❌ Falha na validação de Idempotência!')
    process.exit(1)
  }

  console.log('\n🎉 Todos os testes de ingestão SSW passaram com sucesso!')
  process.exit(0)
}

run().catch((err) => {
  console.error('❌ Erro durante o teste:', err)
  process.exit(1)
})
