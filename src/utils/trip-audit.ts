export type IncidentCategory =
  | 'nf_fiscal'
  | 'recusa_divergencia'
  | 'fila_atraso'
  | 'veiculo_mecanico'
  | 'outros'

export type AuditChannel =
  | 'sistema'
  | 'painel_web'
  | 'motorista_web'
  | 'telegram'
  | 'whatsapp'
  | 'email_ssw'
  | 'edi_ssw'

export type TripAuditEventType =
  | 'CREATED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_AUTH'
  | 'NOTIFICATION_SENT'
  | 'TELEGRAM_LINKED'
  | 'IN_TRANSIT_CONFIRMED'
  | 'GPS_UPDATED'
  | 'PHOTO_UPLOADED'
  | 'ARRIVED'
  | 'ARRIVAL_REVERTED'
  | 'INCIDENT_REPORTED'
  | 'INCIDENT_UPDATED'
  | 'INCIDENT_RESOLVED'
  | 'FINISHED'
  | 'FINISH_REVERTED'
  | 'TRIP_UPDATED'
  | 'TRIP_CANCELLED'

export interface TripAuditEvent {
  id: string
  type: TripAuditEventType
  title: string
  description?: string
  channel: AuditChannel
  actor?: string
  actorName?: string
  timestamp: string
  lat?: number | null
  lng?: number | null
  photoUrl?: string | null
  metadata?: {
    lat?: number | null
    lng?: number | null
    photoUrl?: string | null
    category?: string
    incidentId?: string
    plate?: string
    extra?: string
  }
}

export interface TripIncident {
  id: string
  category: IncidentCategory
  categoryLabel: string
  description: string
  photoUrl?: string | null
  lat?: number | null
  lng?: number | null
  channel: AuditChannel
  reportedBy: string
  createdAt: string
  status: 'open' | 'resolved'
  resolvedAt?: string | null
  resolvedBy?: string | null
  resolutionNotes?: string | null
}

export interface IncidentCategoryInfo {
  id: IncidentCategory
  label: string
  shortLabel: string
  icon: string
  emoji: string
  placeholder: string
}

export const INCIDENT_CATEGORIES: Record<IncidentCategory, IncidentCategoryInfo> = {
  nf_fiscal: {
    id: 'nf_fiscal',
    label: 'NF Vencida / Problema Fiscal',
    shortLabel: 'NF Vencida / Fiscal',
    icon: '📄',
    emoji: '📄',
    placeholder:
      'Ex: Nota fiscal nº 12345 com prazo de validade vencido na portaria ou divergência fiscal...',
  },
  recusa_divergencia: {
    id: 'recusa_divergencia',
    label: 'Recusa / Divergência de Carga',
    shortLabel: 'Recusa / Divergência',
    icon: '📦',
    emoji: '📦',
    placeholder:
      'Ex: Cliente recusou mercadoria por falta de agendamento, pedido divergente ou avaria...',
  },
  fila_atraso: {
    id: 'fila_atraso',
    label: 'Fila / Retenção Excessiva na Doca',
    shortLabel: 'Fila / Doca Lotada',
    icon: '⏳',
    emoji: '⏳',
    placeholder:
      'Ex: Pátio lotado sem previsão de chamada para doca, aguardando senha de descarga...',
  },
  veiculo_mecanico: {
    id: 'veiculo_mecanico',
    label: 'Problema no Veículo / Trânsito',
    shortLabel: 'Veículo / Trânsito',
    icon: '🔧',
    emoji: '🔧',
    placeholder:
      'Ex: Interdição na rodovia, manutenção emergencial ou pneu furado em rota...',
  },
  outros: {
    id: 'outros',
    label: 'Outro Imprevisto Operacional',
    shortLabel: 'Outro Imprevisto',
    icon: '⚠️',
    emoji: '⚠️',
    placeholder:
      'Descreva com detalhes o imprevisto ocorrido na viagem ou tentativa de descarga...',
  },
}

export const AUDIT_CHANNEL_LABELS: Record<
  AuditChannel,
  { label: string; badgeClass: string }
> = {
  motorista_web: {
    label: 'App Web Motorista (/v/)',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  telegram: {
    label: 'Bot Telegram',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  whatsapp: {
    label: 'WhatsApp Oficial',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  painel_web: {
    label: 'Painel de Controle',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  email_ssw: {
    label: 'E-mail SSW (IMAP)',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  edi_ssw: {
    label: 'Importação EDI SSW',
    badgeClass: 'bg-stone-100 text-stone-800 border-stone-300',
  },
  sistema: {
    label: 'Sistema AuditCargo',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
  },
}

export function getIncidentCategoryInfo(category?: string): IncidentCategoryInfo {
  if (category && category in INCIDENT_CATEGORIES) {
    return INCIDENT_CATEGORIES[category as IncidentCategory]
  }
  return INCIDENT_CATEGORIES.outros
}

export function getChannelLabel(channel?: AuditChannel | string): string {
  if (channel && channel in AUDIT_CHANNEL_LABELS) {
    return AUDIT_CHANNEL_LABELS[channel as AuditChannel].label
  }
  return 'Sistema AuditCargo'
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
}

export function parseSafeMetadata(rawMeta: any): Record<string, any> {
  if (!rawMeta) return {}
  if (typeof rawMeta === 'string') {
    try {
      return JSON.parse(rawMeta)
    } catch {
      return {}
    }
  }
  if (typeof rawMeta === 'object') {
    return { ...rawMeta }
  }
  return {}
}

/**
 * Adiciona um evento de rastreabilidade ao objeto sefaz_metadata da viagem
 */
export function appendTripAuditEvent(
  rawMeta: any,
  eventInput: Omit<TripAuditEvent, 'id' | 'timestamp'> & { timestamp?: string }
): Record<string, any> {
  const meta = parseSafeMetadata(rawMeta)
  const currentLogs: TripAuditEvent[] = Array.isArray(meta.audit_logs) ? [...meta.audit_logs] : []

  const actorResolved = eventInput.actor || eventInput.actorName || 'Sistema AuditCargo'
  const latResolved = eventInput.lat ?? eventInput.metadata?.lat ?? null
  const lngResolved = eventInput.lng ?? eventInput.metadata?.lng ?? null
  const photoResolved = eventInput.photoUrl ?? eventInput.metadata?.photoUrl ?? null

  const newEvent: TripAuditEvent = {
    id: generateId('evt'),
    timestamp: eventInput.timestamp || new Date().toISOString(),
    type: eventInput.type,
    title: eventInput.title,
    description: eventInput.description,
    channel: eventInput.channel,
    actor: actorResolved,
    actorName: actorResolved,
    lat: latResolved,
    lng: lngResolved,
    photoUrl: photoResolved,
    metadata: {
      ...eventInput.metadata,
      lat: latResolved,
      lng: lngResolved,
      photoUrl: photoResolved,
    },
  }

  currentLogs.push(newEvent)
  meta.audit_logs = currentLogs
  return meta
}

/**
 * Registra um novo imprevisto/sinistro na viagem e adiciona automaticamente na linha do tempo
 */
export function appendTripIncident(
  rawMeta: any,
  input: {
    category: IncidentCategory
    description: string
    photoUrl?: string | null
    lat?: number | null
    lng?: number | null
    channel: AuditChannel
    reportedBy: string
    createdAt?: string
    awaitingTelegramDetails?: boolean
  }
): {
  metadata: Record<string, any>
  updatedMeta: Record<string, any>
  incident: TripIncident
  newIncident: TripIncident
} {
  const meta = parseSafeMetadata(rawMeta)
  const currentIncidents: TripIncident[] = Array.isArray(meta.incidents) ? [...meta.incidents] : []
  const catInfo = getIncidentCategoryInfo(input.category)
  const nowIso = input.createdAt || new Date().toISOString()

  const newIncident: TripIncident = {
    id: generateId('inc'),
    category: input.category,
    categoryLabel: catInfo.label,
    description: input.description.trim() || `${catInfo.label} reportado pelo condutor.`,
    photoUrl: input.photoUrl || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    channel: input.channel,
    reportedBy: input.reportedBy,
    createdAt: nowIso,
    status: 'open',
  }

  currentIncidents.push(newIncident)
  meta.incidents = currentIncidents
  meta.has_open_incident = currentIncidents.some((i) => i.status === 'open')

  if (input.awaitingTelegramDetails) {
    meta.pending_telegram_incident_id = newIncident.id
  }

  const updatedMeta = appendTripAuditEvent(meta, {
    type: 'INCIDENT_REPORTED',
    title: `Imprevisto Registrado: ${catInfo.label}`,
    description: newIncident.description,
    channel: input.channel,
    actor: input.reportedBy,
    actorName: input.reportedBy,
    timestamp: nowIso,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoUrl: input.photoUrl || null,
    metadata: {
      category: input.category,
      incidentId: newIncident.id,
      photoUrl: input.photoUrl || null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    },
  })

  return {
    metadata: updatedMeta,
    updatedMeta,
    incident: newIncident,
    newIncident,
  }
}

/**
 * Complementa um imprevisto recém-aberto via Telegram quando o motorista envia o texto ou foto explicando o ocorrido
 */
export function updatePendingTelegramIncident(
  rawMeta: any,
  details: {
    description?: string
    photoUrl?: string | null
    actor?: string
    actorName?: string
  }
): {
  metadata: Record<string, any>
  updatedMeta: Record<string, any>
  updatedIncident: TripIncident | null
} {
  const meta = parseSafeMetadata(rawMeta)
  const pendingId = meta.pending_telegram_incident_id
  const currentIncidents: TripIncident[] = Array.isArray(meta.incidents) ? [...meta.incidents] : []

  if (!pendingId || currentIncidents.length === 0) {
    return { metadata: meta, updatedMeta: meta, updatedIncident: null }
  }

  const idx = currentIncidents.findIndex((i) => i.id === pendingId)
  if (idx === -1) {
    delete meta.pending_telegram_incident_id
    return { metadata: meta, updatedMeta: meta, updatedIncident: null }
  }

  const target = { ...currentIncidents[idx] }
  if (details.description?.trim()) {
    target.description = details.description.trim()
  }
  if (details.photoUrl) {
    target.photoUrl = details.photoUrl
  }

  currentIncidents[idx] = target
  meta.incidents = currentIncidents
  delete meta.pending_telegram_incident_id

  const actorResolved = details.actor || details.actorName || target.reportedBy

  const updatedMeta = appendTripAuditEvent(meta, {
    type: 'INCIDENT_UPDATED',
    title: `Detalhes do Imprevisto (${target.categoryLabel})`,
    description: details.description?.trim()
      ? `Relato do motorista: "${details.description.trim()}"`
      : 'Foto comprobatória anexada ao imprevisto via Telegram.',
    channel: 'telegram',
    actor: actorResolved,
    actorName: actorResolved,
    photoUrl: details.photoUrl || target.photoUrl || null,
    metadata: {
      incidentId: target.id,
      category: target.category,
      photoUrl: details.photoUrl || target.photoUrl || null,
    },
  })

  return { metadata: updatedMeta, updatedMeta, updatedIncident: target }
}

/**
 * Marca um imprevisto como resolvido/tratado pela equipe operacional
 */
export function resolveTripIncidentInMeta(
  rawMeta: any,
  incidentId: string,
  resolvedBy: string,
  resolutionNotes?: string
): Record<string, any> {
  const meta = parseSafeMetadata(rawMeta)
  const currentIncidents: TripIncident[] = Array.isArray(meta.incidents) ? [...meta.incidents] : []
  const nowIso = new Date().toISOString()

  const idx = currentIncidents.findIndex((i) => i.id === incidentId)
  if (idx === -1) {
    return meta
  }

  const resolvedIncident: TripIncident = {
    ...currentIncidents[idx],
    status: 'resolved',
    resolvedAt: nowIso,
    resolvedBy,
    resolutionNotes: resolutionNotes?.trim() || 'Tratado pela central de operações.',
  }

  currentIncidents[idx] = resolvedIncident
  meta.incidents = currentIncidents
  meta.has_open_incident = currentIncidents.some((i) => i.status === 'open')

  const updatedMeta = appendTripAuditEvent(meta, {
    type: 'INCIDENT_RESOLVED',
    title: `Imprevisto Tratado: ${resolvedIncident.categoryLabel}`,
    description: resolvedIncident.resolutionNotes || 'Ocorrência concluída pela operação.',
    channel: 'painel_web',
    actor: resolvedBy,
    actorName: resolvedBy,
    timestamp: nowIso,
    metadata: {
      incidentId: resolvedIncident.id,
      category: resolvedIncident.category,
    },
  })

  return updatedMeta
}

/**
 * Retorna a lista de imprevistos da viagem (aceita tanto o objeto trip quanto o sefaz_metadata direto)
 */
export function getTripIncidents(tripOrMeta: any): TripIncident[] {
  if (!tripOrMeta) return []
  const raw =
    tripOrMeta && typeof tripOrMeta === 'object' && 'sefaz_metadata' in tripOrMeta
      ? tripOrMeta.sefaz_metadata
      : tripOrMeta
  const meta = parseSafeMetadata(raw)
  return Array.isArray(meta.incidents) ? meta.incidents : []
}

/**
 * Constrói a linha do tempo 360º completa da viagem, combinando eventos gravados
 * com marcos históricos da viagem (para compatibilidade com viagens antigas)
 */
export function getCompleteTripTimeline(trip: any): TripAuditEvent[] {
  if (!trip) return []
  const meta = parseSafeMetadata(trip.sefaz_metadata)
  const rawLogs: TripAuditEvent[] = Array.isArray(meta.audit_logs) ? [...meta.audit_logs] : []

  const recordedLogs: TripAuditEvent[] = rawLogs.map((ev) => ({
    ...ev,
    actor: ev.actor || ev.actorName || 'Sistema AuditCargo',
    actorName: ev.actorName || ev.actor || 'Sistema AuditCargo',
    lat: ev.lat ?? ev.metadata?.lat ?? null,
    lng: ev.lng ?? ev.metadata?.lng ?? null,
    photoUrl: ev.photoUrl ?? ev.metadata?.photoUrl ?? null,
  }))

  const syntheticLogs: TripAuditEvent[] = []
  const driverName =
    (Array.isArray(trip.drivers) ? trip.drivers[0]?.name : trip.drivers?.name) || 'Motorista'

  // 1. Garante que o marco de criação sempre exista na timeline
  const hasCreatedEvent = recordedLogs.some((e) => e.type === 'CREATED')
  if (!hasCreatedEvent && trip.created_at) {
    const source = meta.source
    let channel: AuditChannel = 'painel_web'
    let title = 'Transporte Criado no Sistema'
    let description = `Viagem ${trip.token ? `#${trip.token}` : ''} registrada${trip.destination ? ` para destino ${trip.destination}` : ''}.`

    if (source === 'edi_conemb_ssw_manifest') {
      channel = 'edi_ssw'
      title = 'Romaneio Importado via EDI SSW (CONEMB)'
      description = `${trip.cte_number || 'Romaneio'} importado com ${meta.total_ctes || 1} CT-e(s) e placa ${meta.plate || 'N/A'}.`
    } else if (source === 'email_ssw') {
      channel = 'email_ssw'
      title = 'Transporte Sincronizado via E-mail SSW'
      description = `CT-e ${trip.cte_number || ''} importado automaticamente da caixa de e-mail.`
    }

    const defaultActor = channel === 'painel_web' ? 'Operação' : 'Integração SSW'

    syntheticLogs.push({
      id: `syn_created_${trip.id || '0'}`,
      type: 'CREATED',
      title,
      description,
      channel,
      actor: defaultActor,
      actorName: defaultActor,
      timestamp: trip.created_at,
      metadata: {
        plate: meta.plate || trip.drivers?.default_plate,
      },
    })
  }

  // 2. Garante marco de chegada se arrival_time existir e não houver ARRIVED gravado
  const hasArrivedEvent = recordedLogs.some((e) => e.type === 'ARRIVED')
  if (!hasArrivedEvent && trip.arrival_time) {
    const lat = trip.checkin_lat || trip.last_driver_latitude || null
    const lng = trip.checkin_lng || trip.last_driver_longitude || null
    const photoUrl = trip.checkin_photo_url || null
    syntheticLogs.push({
      id: `syn_arrived_${trip.id || '0'}`,
      type: 'ARRIVED',
      title: 'Chegada Registrada no Destino / Portaria',
      description: 'Início oficial da contagem de franquia e disparo de e-mail de aviso.',
      channel: 'motorista_web',
      actor: driverName,
      actorName: driverName,
      timestamp: trip.arrival_time,
      lat,
      lng,
      photoUrl,
      metadata: {
        lat,
        lng,
        photoUrl,
      },
    })
  }

  // 3. Garante marco de finalização se completion_time existir e não houver FINISHED gravado
  const hasFinishedEvent = recordedLogs.some((e) => e.type === 'FINISHED')
  if (!hasFinishedEvent && trip.completion_time) {
    syntheticLogs.push({
      id: `syn_finished_${trip.id || '0'}`,
      type: 'FINISHED',
      title: 'Descarga Finalizada e Viagem Concluída',
      description: 'Encerramento da estadia e emissão do dossiê de comprovação.',
      channel: 'motorista_web',
      actor: driverName,
      actorName: driverName,
      timestamp: trip.completion_time,
    })
  }

  const allEvents = [...syntheticLogs, ...recordedLogs]
  return allEvents.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}
