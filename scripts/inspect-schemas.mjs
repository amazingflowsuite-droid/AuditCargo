import fs from 'fs'
import path from 'path'
import https from 'https'
import zlib from 'zlib'

const CERT_PATH = 'C:\\Users\\wilkinson\\Desktop\\Projetos AI\\Amazing Flow\\AuditCargo\\C_CARGO_LOGISTICA_E_TRANSPORTES_LTDA_07546152000133_1788951608160096900.pfx'
const CERT_PASS = '271022Ccargo'

const pfx = fs.readFileSync(CERT_PATH)
const agent = new https.Agent({ pfx, passphrase: CERT_PASS, rejectUnauthorized: false })

const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cte="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe">
  <soap:Body>
    <cte:cteDistDFeInteresse>
      <cte:cteDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00">
          <tpAmb>1</tpAmb>
          <cUFAutor>35</cUFAutor>
          <CNPJ>07546152000133</CNPJ>
          <distNSU>
            <ultNSU>000000000012750</ultNSU>
          </distNSU>
        </distDFeInt>
      </cte:cteDadosMsg>
    </cte:cteDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`

const req = https.request(
  {
    hostname: 'www1.cte.fazenda.gov.br',
    path: '/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
    method: 'POST',
    agent,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse',
    },
  },
  (res) => {
    let data = ''
    res.on('data', (d) => (data += d))
    res.on('end', () => {
      const docZipRegex = /<docZip\s+NSU="([^"]+)"\s+schema="([^"]+)">([\s\S]*?)<\/docZip>/g
      let match
      while ((match = docZipRegex.exec(data)) !== null) {
        const nsu = match[1]
        const schema = match[2]
        const base64 = match[3]

        if (schema.includes('procCTe')) {
          const unzippedXml = zlib.gunzipSync(Buffer.from(base64, 'base64')).toString('utf-8')
          console.log(`\n🎉 ENCONTRAMOS UM CT-e COMPLETO! NSU: ${nsu} (${schema})`)
          
          const chCTe = unzippedXml.match(/Id="CTe(\d+)"/)?.[1]
          const nCT = unzippedXml.match(/<nCT>(.*?)<\/nCT>/)?.[1]
          const emit = unzippedXml.match(/<emit>[\s\S]*?<xNome>(.*?)<\/xNome>/)?.[1]
          const rem = unzippedXml.match(/<rem>[\s\S]*?<xNome>(.*?)<\/xNome>/)?.[1]
          const dest = unzippedXml.match(/<dest>[\s\S]*?<xNome>(.*?)<\/xNome>/)?.[1]
          const destMun = unzippedXml.match(/<dest>[\s\S]*?<xMun>(.*?)<\/xMun>/)?.[1]
          const destUf = unzippedXml.match(/<dest>[\s\S]*?<UF>(.*?)<\/UF>/)?.[1]
          const vTPrest = unzippedXml.match(/<vTPrest>[\s\S]*?<vRec>(.*?)<\/vRec>/)?.[1]

          // Notas fiscais
          const chNFeMatches = [...unzippedXml.matchAll(/<chave>(.*?)<\/chave>/g)].map(m => m[1])

          console.log(`📑 Número CT-e: ${nCT}`)
          console.log(`🔑 Chave CT-e: ${chCTe}`)
          console.log(`🏢 Emitente: ${emit}`)
          console.log(`🏭 Remetente: ${rem}`)
          console.log(`🏪 Destinatário: ${dest} - ${destMun}/${destUf}`)
          console.log(`💰 Valor a Receber (Frete): R$ ${vTPrest}`)
          console.log(`📦 Notas Fiscais vinculadas (${chNFeMatches.length}):`, chNFeMatches.slice(0, 3))
          break
        }
      }
      process.exit(0)
    })
  }
)
req.write(soap)
req.end()
