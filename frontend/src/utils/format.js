export const formatCurrency = (val) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0)

// Bug fix: datas ISO (YYYY-MM-DD) são UTC meia-noite; ao converter para local
// o dia pode recuar um dia. Forçamos meio-dia UTC para evitar isso.
export const formatDate = (str) => {
  if (!str) return '—'
  // Se já é YYYY-MM-DD, parseia sem ambiguidade
  const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, y, m, d] = match
    return `${d}/${m}/${y}`
  }
  // Fallback para outros formatos
  const dt = new Date(str)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('pt-BR')
}

export const formatMonth = (str) => {
  if (!str) return '—'
  const [y, m] = str.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]} ${y}`
}

export const formatPercent = (val, total) =>
  total > 0 ? `${((val / total) * 100).toFixed(1)}%` : '0%'
