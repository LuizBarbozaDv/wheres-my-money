export const formatCurrency = (val) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0)

export const formatDate = (str) => {
  if (!str) return '—'
  const d = new Date(str + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

export const formatMonth = (str) => {
  if (!str) return '—'
  const [y, m] = str.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]} ${y}`
}

export const formatPercent = (val, total) =>
  total > 0 ? `${((val / total) * 100).toFixed(1)}%` : '0%'
