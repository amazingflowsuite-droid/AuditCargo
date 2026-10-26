import fs from 'fs'
import path from 'path'
import https from 'https'
import zlib from 'zlib'
import forge from 'node-forge'

// Lê variáveis do .env.local se não estiverem definidas
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  }
}

// Caminho do Certificado e Senha configurados no .env.local
const CERT_PATH = process.env.SEFAZ_CERT_PATH
const CERT_PASS = process.env.SEFAZ_CERT_PASSWORD

// Chave oficial do CT-e 3159 da foto (Guarulhos -> Birigui / Irmãos Muffato)
const CHAVE_CTE_TESTE = '35261007546152000486570010000031591000412920'
const CNPJ_MATRIZ = '07546152000133'
const CUF_SP = '35'

async function testarConsultaSefaz() {
  console.log('🔐 1. Carregando Certificado Digital A1 da C Cargo...')
  if (!fs.existsSync(CERT_PATH)) {
    throw new Error(`Arquivo do certificado não encontrado em: ${CERT_PATH}`)
  }

  const pfxBuffer = fs.readFileSync(CERT_PATH)
  const p12Der = forge.util.decode64(pfxBuffer.toString('base64'))
  const p12Asn1 = forge.asn1.fromDer(p12Der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, CERT_PASS)

  let pemCert = ''
  let pemKey = ''

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.cert) {
        pemCert += forge.pki.certificateToPem(safeBag.cert)
      } else if (safeBag.key) {
        pemKey += forge.pki.privateKeyToPem(safeBag.key)
      }
    }
  }

  // Cria o agente HTTPS com autenticação mTLS via certificado A1
  const agent = new https.Agent({
    cert: pemCert,
    key: pemKey,
    rejectUnauthorized: false,
  })

  console.log('📡 2. Montando envelope SOAP para o WebService CteDistribuicaoDFe (Ambiente Nacional)...')
  console.log(`🔎 Chave a consultar: ${CHAVE_CTE_TESTE}`)

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cte="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe">
  <soap:Body>
    <cte:cteDistDFeInteresse>
      <cte:cteDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00">
          <tpAmb>1</tpAmb>
          <cUFAutor>${CUF_SP}</cUFAutor>
          <CNPJ>${CNPJ_MATRIZ}</CNPJ>
          <distNSU>
            <ultNSU>000000000000000</ultNSU>
          </distNSU>
        </distDFeInt>
      </cte:cteDadosMsg>
    </cte:cteDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`

  const postData = Buffer.from(soapEnvelope, 'utf-8')

  const options = {
    hostname: 'www1.cte.fazenda.gov.br',
    port: 443,
    path: '/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
    method: 'POST',
    agent: agent,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse',
      'Content-Length': postData.length,
    },
  }

  console.log('🚀 3. Enviando requisição mTLS para a SEFAZ...')

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = ''

      res.on('data', (chunk) => {
        responseBody += chunk
      })

      res.on('end', () => {
        console.log(`\n📥 4. Resposta recebida da SEFAZ (Status HTTP: ${res.statusCode}):`)

        // Extrai status cStat e xMotivo
        const cStatMatch = responseBody.match(/<cStat>(\d+)<\/cStat>/)
        const xMotivoMatch = responseBody.match(/<xMotivo>(.*?)<\/xMotivo>/)

        const cStat = cStatMatch ? cStatMatch[1] : null
        const xMotivo = xMotivoMatch ? xMotivoMatch[1] : null
        const ultNSU = responseBody.match(/<ultNSU>(.*?)<\/ultNSU>/)?.[1]
        const maxNSU = responseBody.match(/<maxNSU>(.*?)<\/maxNSU>/)?.[1]

        console.log(`👉 cStat: ${cStat} | xMotivo: ${xMotivo} | ultNSU: ${ultNSU} | maxNSU: ${maxNSU}`)

        // Extrai e descompacta docZip se retornado
        const docZipMatches = [...responseBody.matchAll(/<docZip[^>]*>(.*?)<\/docZip>/g)]

        if (docZipMatches.length > 0) {
          console.log(`\n🎉 SUCESSO! A SEFAZ entregou ${docZipMatches.length} documento(s) compactado(s) (docZip)!`)

          for (let i = 0; i < Math.min(docZipMatches.length, 3); i++) {
            const base64Data = docZipMatches[i][1]
            const gzipped = Buffer.from(base64Data, 'base64')
            const unzippedXml = zlib.gunzipSync(gzipped).toString('utf-8')

            console.log(`\n=================== DOCUMENTO FISCAL DESCOMPACTADO (${i + 1}) ===================`)
            console.log(unzippedXml.slice(0, 600))
          }
        } else {
          console.log('\nRetorno XML bruto da SEFAZ:\n', responseBody)
        }

        resolve(true)
      })
    })

    req.on('error', (err) => {
      console.error('❌ Falha na conexão com a SEFAZ:', err)
      reject(err)
    })

    req.write(postData)
    req.end()
  })
}

testarConsultaSefaz().catch((err) => {
  console.error('❌ Erro no teste:', err.message)
  process.exit(1)
})
