import nodemailer from 'nodemailer'

export interface ArrivalEmailData {
  toEmail: string
  destinationName: string
  destinationCity?: string
  invoices: string[] | string
  arrivalTime?: string | Date
  cteNumber?: string | null
  driverName?: string
  notes?: string
}

export function formatTimeForEmail(dateInput?: string | Date): string {
  const date = dateInput ? new Date(dateInput) : new Date()
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  })
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Bom dia,'
  if (hour >= 12 && hour < 18) return 'Boa tarde,'
  return 'Boa noite,'
}

export function generateArrivalEmailSubject(
  destinationName: string,
  destinationCity: string = '',
  invoices: string[] | string = ''
): string {
  const invStr = Array.isArray(invoices) ? invoices.filter(Boolean).join(', ') : invoices
  const cityClean = destinationCity ? ` - ${destinationCity.toUpperCase()}` : ''
  const destClean = destinationName.toUpperCase()
  const nfPart = invStr ? ` - NF ${invStr}` : ''

  return `AGUARDANDO - ${destClean}${cityClean}${nfPart}`
}

export function generateArrivalEmailHtml(data: ArrivalEmailData): string {
  const greeting = getGreeting()
  const timeFormatted = formatTimeForEmail(data.arrivalTime)
  const invoicesStr = Array.isArray(data.invoices)
    ? data.invoices.filter(Boolean).join(', ')
    : data.invoices || 'S/ NF'
  const destination = data.destinationName || 'Destino'
  const obs = data.notes || (data.cteNumber ? `Obs: DACTE / CT-e: ${data.cteNumber}` : 'Obs: Motorista posicionado no local.')

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Aviso de Chegada</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #1c1917;
      margin: 0;
      padding: 24px;
      background-color: #ffffff;
      line-height: 1.5;
    }
    .container {
      max-width: 650px;
      margin: 0 auto;
    }
    .greeting {
      font-size: 15px;
      margin-bottom: 18px;
    }
    .status-msg {
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 14px;
    }
    .obs-msg {
      font-size: 14px;
      color: #44403c;
      margin-bottom: 24px;
    }
    table.arrival-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      margin-bottom: 32px;
      border: 1px solid #000000;
      font-size: 14px;
    }
    table.arrival-table th {
      border: 1px solid #000000;
      padding: 10px 14px;
      background-color: #f8fafc;
      font-weight: bold;
      text-align: center;
      color: #0f172a;
    }
    table.arrival-table td {
      border: 1px solid #000000;
      padding: 10px 14px;
      text-align: center;
      color: #1e293b;
    }
    .signature {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 14px;
      color: #334155;
    }
    .sig-name {
      font-size: 18px;
      font-weight: bold;
      color: #dc2626;
      margin-bottom: 2px;
    }
    .sig-role {
      font-size: 13px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .sig-brand {
      display: inline-block;
      font-size: 24px;
      font-weight: 900;
      color: #dc2626;
      letter-spacing: -0.5px;
      margin: 10px 0;
    }
    .sig-contact {
      font-size: 13px;
      color: #475569;
      line-height: 1.6;
    }
    .sig-email {
      font-weight: bold;
      color: #dc2626;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="greeting">${greeting}</div>
    
    <div class="status-msg">Motorista aguardando para descarregar</div>
    
    <div class="obs-msg">${obs}</div>

    <table class="arrival-table">
      <thead>
        <tr>
          <th>NF</th>
          <th>DESTINO</th>
          <th>STATUS</th>
          <th>CHEGADA</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${invoicesStr}</strong></td>
          <td>${destination}</td>
          <td>Aguardando</td>
          <td>${timeFormatted}</td>
        </tr>
      </tbody>
    </table>

    <div class="signature">
      <div class="sig-name">Atendimento AuditCargo</div>
      <div class="sig-role">Operações de Transporte & Telemetria Portuária</div>
      
      <div class="sig-brand">
        <span style="border: 2px solid #0d9488; border-radius: 50%; padding: 2px 7px; margin-right: 4px; font-size: 16px; color: #0d9488;">A</span><span style="color: #0f172a;">uditCargo</span>
      </div>

      <div class="sig-contact">
        <div>E-mail: <span class="sig-email" style="color: #0d9488;">${process.env.SMTP_USER || 'amazingflowsuite@gmail.com'}</span></div>
        <div>Telefones: <strong>(11) 5023-0008 / (11) 2611-7570</strong></div>
      </div>
    </div>
  </div>
</body>
</html>
`
}

export async function sendArrivalEmail(data: ArrivalEmailData): Promise<{
  success: boolean
  messageId?: string
  simulated?: boolean
  error?: string
}> {
  if (!data.toEmail || !data.toEmail.includes('@')) {
    return {
      success: false,
      error: 'Destinatário não possui e-mail cadastrado.',
    }
  }

  // Trava de segurança: NUNCA disparar para @ccargo.com.br em ambiente de teste
  if (data.toEmail.toLowerCase().includes('@ccargo.com.br')) {
    console.warn(`⚠️ [BLOQUEIO DE SEGURANÇA] Envio abortado: destinatário com domínio @ccargo.com.br (${data.toEmail}) bloqueado para testes.`)
    return {
      success: false,
      error: 'Envios para @ccargo.com.br estão temporariamente desativados por segurança.',
    }
  }

  const subject = generateArrivalEmailSubject(
    data.destinationName,
    data.destinationCity,
    data.invoices
  )
  const html = generateArrivalEmailHtml(data)

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com'
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM || `AuditCargo <${smtpUser || 'amazingflowsuite@gmail.com'}>`

  // Filtra rigorosamente qualquer e-mail do domínio @ccargo.com.br da lista de cópia (Cc)
  const ccEmails = process.env.EMAIL_NOTIFY_CC
    ? process.env.EMAIL_NOTIFY_CC.split(',')
        .map((e) => e.trim())
        .filter((e) => e && !e.toLowerCase().includes('@ccargo.com.br'))
    : undefined

  // Modo simulação se SMTP não configurado
  if (!smtpHost || !smtpUser) {
    console.log('\n======================================================')
    console.log('📨 [AUDITCARGO - ENVIO DE E-MAIL DE CHEGADA (SIMULADO)]')
    console.log(`Para: ${data.toEmail}`)
    if (ccEmails) console.log(`Cc: ${ccEmails.join(', ')}`)
    console.log(`Assunto: ${subject}`)
    console.log(`Chegada: ${formatTimeForEmail(data.arrivalTime)}`)
    console.log(`Destino: ${data.destinationName}`)
    console.log(`NF(s): ${Array.isArray(data.invoices) ? data.invoices.join(', ') : data.invoices}`)
    console.log('Status: Disparado com sucesso via Telemetria de Portaria.')
    console.log('======================================================\n')

    return {
      success: true,
      simulated: true,
      messageId: `simulated_${Date.now()}`,
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: data.toEmail,
      cc: ccEmails,
      subject: subject,
      html: html,
    })

    console.log(`📨 E-mail de chegada enviado com sucesso para ${data.toEmail}: ${info.messageId}`)
    return {
      success: true,
      messageId: info.messageId,
      simulated: false,
    }
  } catch (err: any) {
    console.error('Erro ao enviar e-mail via SMTP:', err)
    return {
      success: false,
      error: err.message || 'Falha no servidor SMTP',
    }
  }
}
