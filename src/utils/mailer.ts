import nodemailer from 'nodemailer'

export interface CompanyInfo {
  name?: string
  contact?: string
  phone?: string
  email?: string
  website?: string
}

export interface ArrivalEmailData {
  toEmail: string
  destinationName: string
  destinationCity?: string
  invoices: string[] | string
  arrivalTime?: string | Date
  cteNumber?: string | null
  driverName?: string
  serviceType?: string
  sender?: string
  companyInfo?: CompanyInfo
  checkinPhotoUrl?: string | null
  notes?: string
  extraCc?: string[]
}

export interface CompletionEmailData {
  toEmail: string
  destinationName: string
  destinationCity?: string
  invoices: string[] | string
  arrivalTime?: string | Date
  departureTime?: string | Date
  cteNumber?: string | null
  driverName?: string
  serviceType?: string
  sender?: string
  companyInfo?: CompanyInfo
  checkinPhotoUrl?: string | null
  notes?: string
  extraCc?: string[]
}

export function formatTimeForEmail(dateInput?: string | Date): string {
  const date = dateInput ? new Date(dateInput) : new Date()
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  })
}

export function formatDateForEmail(dateInput?: string | Date): string {
  const date = dateInput ? new Date(dateInput) : new Date()
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
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

export function generateCompletionEmailSubject(
  destinationName: string,
  destinationCity: string = '',
  invoices: string[] | string = ''
): string {
  const invStr = Array.isArray(invoices) ? invoices.filter(Boolean).join(', ') : invoices
  const cityClean = destinationCity ? ` - ${destinationCity.toUpperCase()}` : ''
  const destClean = destinationName.toUpperCase()
  const nfPart = invStr ? ` : NF ${invStr}` : ''

  return `ENTREGUE${nfPart} - ${destClean}${cityClean}`
}

export function generateArrivalEmailHtml(data: ArrivalEmailData): string {
  const greeting = getGreeting()
  const timeFormatted = formatTimeForEmail(data.arrivalTime)
  const invoicesStr = Array.isArray(data.invoices)
    ? data.invoices.filter(Boolean).join(', ')
    : data.invoices || 'S/ NF'
  const destination = data.destinationName || 'Destino'
  const cte = data.cteNumber || 'S/ DACTE'
  const service = data.serviceType || 'Estadia'
  const sender = data.sender || 'Não inf.'
  const comp = data.companyInfo
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
      max-width: 720px;
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
      font-size: 13px;
    }
    table.arrival-table th {
      border: 1px solid #000000;
      padding: 10px 10px;
      background-color: #f8fafc;
      font-weight: bold;
      text-align: center;
      color: #0f172a;
    }
    table.arrival-table td {
      border: 1px solid #000000;
      padding: 10px 10px;
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
    .photo-box {
      margin-top: 20px;
      margin-bottom: 25px;
      padding: 14px;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .photo-btn {
      display: inline-block;
      padding: 8px 16px;
      background-color: #0d9488;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: bold;
      font-size: 13px;
      border-radius: 4px;
      margin-top: 6px;
    }
    .sig-brand {
      display: inline-block;
      font-size: 20px;
      font-weight: 900;
      color: #0d9488;
      letter-spacing: -0.5px;
      margin: 8px 0;
    }
    .sig-contact {
      font-size: 13px;
      color: #475569;
      line-height: 1.6;
    }
    .sig-email {
      font-weight: bold;
      color: #0d9488;
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
          <th>DACTE</th>
          <th>SERVIÇO</th>
          <th>REMETENTE</th>
          <th>NF</th>
          <th>DESTINO</th>
          <th>STATUS</th>
          <th>CHEGADA</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${cte}</strong></td>
          <td>${service}</td>
          <td>${sender}</td>
          <td><strong>${invoicesStr}</strong></td>
          <td>${destination}</td>
          <td>Aguardando</td>
          <td>${timeFormatted}</td>
        </tr>
      </tbody>
    </table>

    ${data.checkinPhotoUrl ? `
    <div class="photo-box">
      <div style="font-size: 13px; font-weight: bold; color: #1e293b;">Comprovante / Registro de Portaria:</div>
      <p style="font-size: 12px; color: #64748b; margin: 4px 0 8px 0;">O motorista registrou a imagem comprobatória no momento da chegada ao destino.</p>
      ${data.checkinPhotoUrl.startsWith('http') ? `
      <a href="${data.checkinPhotoUrl}" target="_blank" class="photo-btn">
        📷 Visualizar Foto Comprobatória
      </a>
      ` : `
      <div style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; color: #334155; font-weight: 500; margin-top: 4px;">
        📎 Arquivo anexado a esta mensagem (comprovante-chegada.jpg)
      </div>
      `}
    </div>
    ` : ''}

    <div class="signature">
      <div class="sig-brand">
        ${comp?.name || 'AuditCargo'}
      </div>

      <div class="sig-contact">
        ${comp?.contact ? `<div>Contato: <strong>${comp.contact}</strong></div>` : ''}
        <div>E-mail: <a href="mailto:${comp?.email || process.env.SMTP_USER || 'amazingflowsuite@gmail.com'}" class="sig-email">${comp?.email || process.env.SMTP_USER || 'amazingflowsuite@gmail.com'}</a></div>
        ${comp?.phone ? `<div>Telefones: <strong>${comp.phone}</strong></div>` : ''}
        ${comp?.website ? `<div>Site: <a href="${comp.website.startsWith('http') ? comp.website : `https://${comp.website}`}" target="_blank" style="color: #64748b; text-decoration: underline;">${comp.website}</a></div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`
}

export function generateCompletionEmailHtml(data: CompletionEmailData): string {
  const greeting = getGreeting()
  const arrivalFormatted = data.arrivalTime ? formatTimeForEmail(data.arrivalTime) : '--:--'
  const departureFormatted = data.departureTime ? formatTimeForEmail(data.departureTime) : formatTimeForEmail(new Date())
  const dateFormatted = formatDateForEmail(data.departureTime || new Date())
  const invoicesStr = Array.isArray(data.invoices)
    ? data.invoices.filter(Boolean).join(', ')
    : data.invoices || 'S/ NF'
  const destination = data.destinationName || 'Destino'
  const cte = data.cteNumber || 'S/ DACTE'
  const service = data.serviceType || 'Estadia'
  const sender = data.sender || 'Não inf.'
  const comp = data.companyInfo

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Entrega Realizada com Sucesso</title>
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
      max-width: 760px;
      margin: 0 auto;
    }
    .greeting {
      font-size: 15px;
      margin-bottom: 18px;
    }
    .status-msg {
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 24px;
      color: #15803d;
    }
    table.arrival-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      margin-bottom: 24px;
      border: 1px solid #000000;
      font-size: 13px;
    }
    table.arrival-table th {
      border: 1px solid #000000;
      padding: 10px 10px;
      background-color: #f8fafc;
      font-weight: bold;
      text-align: center;
      color: #0f172a;
    }
    table.arrival-table td {
      border: 1px solid #000000;
      padding: 10px 10px;
      text-align: center;
      color: #1e293b;
    }
    .photo-box {
      margin-top: 20px;
      margin-bottom: 25px;
      padding: 14px;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .photo-btn {
      display: inline-block;
      padding: 8px 16px;
      background-color: #0d9488;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: bold;
      font-size: 13px;
      border-radius: 4px;
      margin-top: 6px;
    }
    .signature {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 14px;
      color: #334155;
    }
    .sig-brand {
      display: inline-block;
      font-size: 20px;
      font-weight: 900;
      color: #0d9488;
      letter-spacing: -0.5px;
      margin: 8px 0;
    }
    .sig-contact {
      font-size: 13px;
      color: #475569;
      line-height: 1.6;
    }
    .sig-email {
      font-weight: bold;
      color: #0d9488;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="greeting">${greeting}</div>
    
    <div class="status-msg">Entrega realizada com sucesso.</div>

    <table class="arrival-table">
      <thead>
        <tr>
          <th>DACTE</th>
          <th>SERVIÇO</th>
          <th>REMETENTE</th>
          <th>NF</th>
          <th>DESTINO</th>
          <th>STATUS</th>
          <th>CHEGADA</th>
          <th>SAÍDA</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${cte}</strong></td>
          <td>${service}</td>
          <td>${sender}</td>
          <td><strong>${invoicesStr}</strong></td>
          <td>${destination}</td>
          <td>ENTREGUE ${dateFormatted}</td>
          <td>${arrivalFormatted}</td>
          <td>${departureFormatted}</td>
        </tr>
      </tbody>
    </table>

    ${data.checkinPhotoUrl ? `
    <div class="photo-box">
      <div style="font-size: 13px; font-weight: bold; color: #1e293b;">Comprovante / Registro de Portaria:</div>
      <p style="font-size: 12px; color: #64748b; margin: 4px 0 8px 0;">O motorista registrou a imagem comprobatória no momento da operação.</p>
      ${data.checkinPhotoUrl.startsWith('http') ? `
      <a href="${data.checkinPhotoUrl}" target="_blank" class="photo-btn">
        📷 Visualizar Foto Comprobatória
      </a>
      ` : `
      <div style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; color: #334155; font-weight: 500; margin-top: 4px;">
        📎 Arquivo anexado a esta mensagem (comprovante-entrega.jpg)
      </div>
      `}
    </div>
    ` : ''}

    <div class="signature">
      <div class="sig-brand">
        ${comp?.name || 'AuditCargo'}
      </div>

      <div class="sig-contact">
        ${comp?.contact ? `<div>Contato: <strong>${comp.contact}</strong></div>` : ''}
        <div>E-mail: <a href="mailto:${comp?.email || process.env.SMTP_USER || 'amazingflowsuite@gmail.com'}" class="sig-email">${comp?.email || process.env.SMTP_USER || 'amazingflowsuite@gmail.com'}</a></div>
        ${comp?.phone ? `<div>Telefones: <strong>${comp.phone}</strong></div>` : ''}
        ${comp?.website ? `<div>Site: <a href="${comp.website.startsWith('http') ? comp.website : `https://${comp.website}`}" target="_blank" style="color: #64748b; text-decoration: underline;">${comp.website}</a></div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`
}

function isSafePublicAttachmentUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    // Prevenção Anti-SSRF: Rejeita loopback, redes privadas e metadados locais de nuvem
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function resolveCcList(extraCc?: string[]): string[] | undefined {
  const envCc = process.env.EMAIL_NOTIFY_CC
    ? process.env.EMAIL_NOTIFY_CC.split(',').map((e) => e.trim())
    : []

  const combined = [...envCc, ...(extraCc || [])]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  // Remove duplicados e bloqueia domínio restrito
  const unique = Array.from(new Set(combined)).filter((e) => !e.includes('@ccargo.com.br'))

  return unique.length > 0 ? unique : undefined
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

  const ccEmails = resolveCcList(data.extraCc)

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

    const mailOptions: any = {
      from: smtpFrom,
      to: data.toEmail,
      cc: ccEmails,
      subject: subject,
      html: html,
    }

    if (data.companyInfo?.email) {
      mailOptions.replyTo = data.companyInfo.email
    }

    // Se houver foto, anexa ao e-mail (suporta Data URL base64 e URLs HTTPS seguras)
    if (data.checkinPhotoUrl) {
      if (data.checkinPhotoUrl.startsWith('data:image/')) {
        const commaIdx = data.checkinPhotoUrl.indexOf(',')
        if (commaIdx !== -1) {
          const mimeMatch = data.checkinPhotoUrl.match(/data:(image\/[a-zA-Z+]+);base64/)
          const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
          const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
          const base64Data = data.checkinPhotoUrl.slice(commaIdx + 1)
          mailOptions.attachments = [
            {
              filename: `comprovante-chegada.${ext}`,
              content: Buffer.from(base64Data, 'base64'),
              contentType,
            },
          ]
        }
      } else if (isSafePublicAttachmentUrl(data.checkinPhotoUrl)) {
        mailOptions.attachments = [
          {
            filename: 'comprovante-chegada.jpg',
            path: data.checkinPhotoUrl,
          },
        ]
      }
    }

    const info = await transporter.sendMail(mailOptions)

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

export async function sendCompletionEmail(data: CompletionEmailData): Promise<{
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

  const subject = generateCompletionEmailSubject(
    data.destinationName,
    data.destinationCity,
    data.invoices
  )
  const html = generateCompletionEmailHtml(data)

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com'
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM || `AuditCargo <${smtpUser || 'amazingflowsuite@gmail.com'}>`

  const ccEmails = resolveCcList(data.extraCc)

  // Modo simulação se SMTP não configurado
  if (!smtpHost || !smtpUser) {
    console.log('\n======================================================')
    console.log('📨 [AUDITCARGO - ENVIO DE E-MAIL DE FINALIZAÇÃO (SIMULADO)]')
    console.log(`Para: ${data.toEmail}`)
    if (ccEmails) console.log(`Cc: ${ccEmails.join(', ')}`)
    console.log(`Assunto: ${subject}`)
    console.log(`Chegada: ${data.arrivalTime ? formatTimeForEmail(data.arrivalTime) : '--:--'}`)
    console.log(`Saída: ${formatTimeForEmail(data.departureTime || new Date())}`)
    console.log(`Destino: ${data.destinationName}`)
    console.log(`NF(s): ${Array.isArray(data.invoices) ? data.invoices.join(', ') : data.invoices}`)
    console.log('Status: Entrega concluída e comunicada aos destinatários e cópias.')
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

    const mailOptions: any = {
      from: smtpFrom,
      to: data.toEmail,
      cc: ccEmails,
      subject: subject,
      html: html,
    }

    if (data.companyInfo?.email) {
      mailOptions.replyTo = data.companyInfo.email
    }

    // Se houver foto, anexa ao e-mail (suporta Data URL base64 e URLs HTTPS seguras)
    if (data.checkinPhotoUrl) {
      if (data.checkinPhotoUrl.startsWith('data:image/')) {
        const commaIdx = data.checkinPhotoUrl.indexOf(',')
        if (commaIdx !== -1) {
          const mimeMatch = data.checkinPhotoUrl.match(/data:(image\/[a-zA-Z+]+);base64/)
          const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
          const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
          const base64Data = data.checkinPhotoUrl.slice(commaIdx + 1)
          mailOptions.attachments = [
            {
              filename: `comprovante-entrega.${ext}`,
              content: Buffer.from(base64Data, 'base64'),
              contentType,
            },
          ]
        }
      } else if (isSafePublicAttachmentUrl(data.checkinPhotoUrl)) {
        mailOptions.attachments = [
          {
            filename: 'comprovante-entrega.jpg',
            path: data.checkinPhotoUrl,
          },
        ]
      }
    }

    const info = await transporter.sendMail(mailOptions)

    console.log(`📨 E-mail de finalização enviado com sucesso para ${data.toEmail}: ${info.messageId}`)
    return {
      success: true,
      messageId: info.messageId,
      simulated: false,
    }
  } catch (err: any) {
    console.error('Erro ao enviar e-mail de finalização via SMTP:', err)
    return {
      success: false,
      error: err.message || 'Falha no servidor SMTP',
    }
  }
}
