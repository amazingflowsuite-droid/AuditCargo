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

const token = process.env.TELEGRAM_BOT_TOKEN
const publicUrl = process.argv[2]

if (!publicUrl) {
  console.log('ℹ️ Uso: node scripts/set-telegram-webhook.js <URL_PUBLICA>')
  console.log('Exemplo: node scripts/set-telegram-webhook.js https://meudominio.com')
  console.log('Exemplo Ngrok: node scripts/set-telegram-webhook.js https://xyz.ngrok-free.app')
  process.exit(1)
}

const cleanUrl = publicUrl.replace(/\/$/, '')
const webhookEndpoint = `${cleanUrl}/api/telegram/webhook`

async function configureWebhook() {
  console.log(`📡 Registrando Webhook no Telegram: ${webhookEndpoint}`)
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookEndpoint)}`)
  const result = await response.json()
  console.log('Resposta do Telegram:', result)
}

configureWebhook()
