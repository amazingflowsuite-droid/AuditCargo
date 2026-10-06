const nodemailer = require('nodemailer')
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

async function testHostingerEmail() {
  const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com'
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM || smtpUser

  console.log('--- TESTE DE CONEXÃO SMTP HOSTINGER ---')
  console.log(`Servidor: ${smtpHost}:${smtpPort}`)
  console.log(`Usuário: ${smtpUser || '(não configurado)'}`)
  console.log(`De: ${smtpFrom}`)

  if (!smtpUser || !smtpPass) {
    console.error('\n❌ ERRO: SMTP_USER e SMTP_PASS precisam ser preenchidos no arquivo .env.local.')
    process.exit(1)
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })

  try {
    console.log('\n1. Testando autenticação com o servidor Hostinger...')
    await transporter.verify()
    console.log('✅ Autenticação realizada com sucesso!')

    const target = process.argv[2] || smtpUser
    if (target.toLowerCase().includes('@ccargo.com.br')) {
      console.error('\n⚠️ [BLOQUEIO DE SEGURANÇA]: Envios para @ccargo.com.br estão bloqueados no ambiente de testes.')
      process.exit(1)
    }
    console.log(`\n2. Enviando e-mail de teste para: ${target}...`)

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: target,
      subject: 'AGUARDANDO - SUPERMERCADOS JAU SERVE - JAU - NF 235609 (TESTE HOSTINGER)',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #0d9488;">Teste de Integração de E-mail AuditCargo</h2>
          <p>Se você recebeu esta mensagem, a parametrização SMTP da Hostinger está funcionando 100%!</p>
          <table border="1" cellpadding="8" style="border-collapse: collapse; text-align: center; margin-top: 15px;">
            <tr style="background-color: #f1f5f9;">
              <th>NF</th><th>DESTINO</th><th>STATUS</th><th>CHEGADA</th>
            </tr>
            <tr>
              <td>235609</td><td>Supermercados Jau Serve</td><td>Aguardando</td><td>${new Date().toLocaleTimeString('pt-BR')}</td>
            </tr>
          </table>
          <p style="margin-top: 25px; font-size: 13px; color: #64748b;">Enviado via Hostinger SMTP por AuditCargo.</p>
        </div>
      `,
    })

    console.log(`✅ E-mail de teste enviado com sucesso! Message ID: ${info.messageId}`)
    console.log('Verifique a sua caixa de entrada (ou spam).')
  } catch (err) {
    console.error('\n❌ Falha no envio:', err.message)
    if (err.message.includes('Invalid login') || err.message.includes('Username and Password not accepted')) {
      console.error('👉 Verifique se o e-mail completo e a senha cadastrados na Hostinger estão corretos.')
    }
  }
}

testHostingerEmail()
