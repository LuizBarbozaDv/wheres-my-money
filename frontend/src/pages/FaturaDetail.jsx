import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'

import { faturasApi, transacoesApi, categoriasApi } from '../utils/api'
import { formatCurrency, formatDate, formatMonth, formatPercent } from '../utils/format'
import StatCard from '../components/StatCard'
import clsx from 'clsx'

// ========== TEMA PADRONIZADO ==========
const theme = {
  bg: '#0B1120',
  cardBg: '#111827',
  border: '#1F2937',
  hover: '#1E293B',
  text: '#F1F5F9',
  textMuted: '#64748B',
  textDim: '#475569',
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  accent: '#8B5CF6',
  badgeBg: '#1E2937',
  badgeBorder: '#334155',
  activeTab: '#6366F1',
  inactiveTabText: '#94A3B8',
  tooltipBg: '#111827',
  tooltipBorder: 'rgba(99, 102, 241, 0.3)',
}

// Paleta fallback (12 cores) – usada se o backend não devolver categoria_cor
const CHART_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#F97316', '#F59E0B',
  '#10B981', '#14B8A6', '#06B6D4', '#3B82F6', '#6B7280', '#9CA3AF',
]

export default function FaturaDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [fatura, setFatura] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [transacoes, setTransacoes] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumo')
  const [filtros, setFiltros] = useState({ busca: '', categoria: '', tipo: '', order: 'data', dir: 'desc', page: 1 })
  const [totalTrans, setTotalTrans] = useState(0)
  const [editCategoria, setEditCategoria] = useState(null)
  const [activeSlice, setActiveSlice] = useState(null)

  const carregarBase = useCallback(async () => {
    try {
      const [f, r, cats] = await Promise.all([
        faturasApi.buscar(id),
        faturasApi.resumo(id),
        categoriasApi.listar()
      ])
      setFatura(f)
      setResumo(r)
      setCategorias(cats)
    } catch (e) {
      console.error(e)
    }
  }, [id])

  const carregarTransacoes = useCallback(async () => {
    try {
      const res = await transacoesApi.listar(id, { ...filtros, limit: 30 })
      setTransacoes(res.data)
      setTotalTrans(res.total)
    } catch (e) {
      console.error(e)
    }
  }, [id, filtros])

  useEffect(() => {
    setLoading(true)
    carregarBase().finally(() => setLoading(false))
  }, [carregarBase])

  useEffect(() => {
    if (tab === 'transacoes') carregarTransacoes()
  }, [tab, carregarTransacoes])

  const handleCategoria = async (tid, catId) => {
    await transacoesApi.atualizarCategoria(tid, catId)
    setEditCategoria(null)
    carregarTransacoes()
    carregarBase()
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      <p className="text-sm text-slate-400">Carregando fatura...</p>
    </div>
  )

  if (!fatura) return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">🔍</div>
      <p className="mb-4 text-slate-400">Fatura não encontrada</p>
      <button onClick={() => navigate('/')} className="btn-ghost">← Voltar</button>
    </div>
  )

  const totais = resumo?.totais || {}
  const porCategoria = resumo?.por_categoria || []
  const porEstab = resumo?.por_estabelecimento || []
  const porDia = resumo?.por_dia || []

  // Dados para o gráfico de rosca (categorias)
  const pieData = porCategoria
    .filter(c => parseFloat(c.total_gasto) > 0)
    .map((c, i) => ({
      name: `${c.icone || '💳'} ${c.categoria || 'Sem categoria'}`,
      value: parseFloat(c.total_gasto),
      color: c.cor || CHART_COLORS[i % CHART_COLORS.length]
    }))

  // Top 10 estabelecimentos com agregação e cor da categoria
  const rawBarData = porEstab.map(e => ({
    name: (e.estabelecimento || 'Desconhecido').substring(0, 22),
    valor: parseFloat(e.total_gasto),
    categoria_cor: e.categoria_cor // fornecido pelo backend
  }))

  const grouped = rawBarData.reduce((acc, curr) => {
    if (!acc[curr.name]) {
      acc[curr.name] = { valor: 0, categoria_cor: curr.categoria_cor }
    }
    acc[curr.name].valor += curr.valor
    // Mantém a cor do primeiro item; se quiser a predominante, precisaria de lógica adicional
    if (!acc[curr.name].categoria_cor && curr.categoria_cor) {
      acc[curr.name].categoria_cor = curr.categoria_cor
    }
    return acc
  }, {})

  let barData = Object.entries(grouped).map(([name, data]) => ({
    name,
    valor: data.valor,
    cor: data.categoria_cor || CHART_COLORS[Object.keys(grouped).indexOf(name) % CHART_COLORS.length]
  }))
  barData.sort((a, b) => b.valor - a.valor)
  barData = barData.slice(0, 10)

  const areaData = porDia.map(d => ({
    dia: formatDate(d.dia).substring(0, 5),
    total: parseFloat(d.total)
  }))

  // Tooltips
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: theme.tooltipBg,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '10px 14px',
        fontSize: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
      }}>
        <p style={{ color: theme.textMuted, marginBottom: 6, fontWeight: 500 }}>{label}</p>
        {payload.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill || theme.primary }} />
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: theme.text }}>
              {formatCurrency(p.value)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    return (
      <div style={{
        background: theme.tooltipBg,
        border: `1px solid ${d.payload.color}50`,
        borderRadius: 12,
        padding: '10px 14px',
        fontSize: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
      }}>
        <p style={{ fontWeight: 600, color: theme.text, marginBottom: 4 }}>{d.name}</p>
        <p style={{ fontFamily: 'monospace', fontWeight: 700, color: d.payload.color }}>
          {formatCurrency(d.value)}
        </p>
        <p style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
          {formatPercent(d.value, totais.total_gasto)}
        </p>
      </div>
    )
  }

  const DonutLabel = ({ viewBox }) => {
    const { cx, cy } = viewBox
    const total = pieData.reduce((s, d) => s + d.value, 0)
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
        <tspan x={cx} dy="-0.5em" fontSize="11" fill={theme.textMuted}>Total</tspan>
        <tspan x={cx} dy="1.6em" fontSize="12" fontWeight="700" fill={theme.text}>
          {formatCurrency(total)}
        </tspan>
      </text>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/')} className="btn-ghost mt-1 text-sm flex-shrink-0">← Voltar</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold truncate" style={{ color: theme.text }}>
            {fatura.nome}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="badge text-xs font-semibold"
              style={{ background: `${theme.primary}20`, color: theme.primary }}
            >
              📅 {formatMonth(fatura.mes_referencia)}
            </span>
            {fatura.cartao && (
              <span
                className="badge text-xs"
                style={{ background: theme.badgeBg, color: theme.inactiveTabText, border: `1px solid ${theme.badgeBorder}` }}
              >
                💳 {fatura.cartao}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-stagger">
        <StatCard icon="💸" label="Total Gasto" value={formatCurrency(totais.total_gasto)} color="0B1120" />
        <StatCard icon="🔢" label="Transações" value={totais.total_transacoes} color="0B1120" />
        <StatCard icon="🎯" label="Ticket Médio" value={formatCurrency(totais.ticket_medio)} color="0B1120" />
        <StatCard icon="⬆️" label="Maior Gasto" value={formatCurrency(totais.maior_gasto)} color="0B1120" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
        {[['resumo', 'Resumo'], ['transacoes', 'Transações']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150',
              tab === key ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            )}
            style={tab === key ? { backgroundColor: theme.activeTab } : { color: theme.inactiveTabText }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* RESUMO */}
      {tab === 'resumo' && (
        <div className="space-y-5 animate-fade-up">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Donut (categorias) */}
            <div className="card p-5" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
              <h3 className="font-display font-semibold mb-5" style={{ color: theme.text }}>Gastos por Categoria</h3>
              {pieData.length > 0 ? (
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="flex-shrink-0">
                    <ResponsiveContainer width={200} height={200}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={56}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          onMouseEnter={(_, i) => setActiveSlice(i)}
                          onMouseLeave={() => setActiveSlice(null)}
                        >
                          {pieData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.color}
                              stroke="none"
                              opacity={activeSlice === null || activeSlice === i ? 1 : 0.3}
                              style={{ cursor: 'pointer', transition: 'opacity .2s' }}
                            />
                          ))}
                          <DonutLabel />
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1 w-full">
                    {pieData.slice(0, 7).map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all"
                        style={{
                          background: activeSlice === i ? `${d.color}18` : 'transparent',
                          border: `1px solid ${activeSlice === i ? d.color + '35' : 'transparent'}`
                        }}
                        onMouseEnter={() => setActiveSlice(i)}
                        onMouseLeave={() => setActiveSlice(null)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: d.color, boxShadow: `0 0 5px ${d.color}90` }}
                          />
                          <span className="truncate text-xs font-medium" style={{ color: theme.textMuted }}>{d.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono text-xs font-semibold" style={{ color: theme.text }}>
                            {formatCurrency(d.value)}
                          </span>
                          <span className="text-xs w-10 text-right tabular-nums" style={{ color: theme.textDim }}>
                            {formatPercent(d.value, totais.total_gasto)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <EmptyChart />}
            </div>

            {/* Área (evolução diária) */}
            <div className="card p-5" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
              <h3 className="font-display font-semibold mb-5" style={{ color: theme.text }}>Gastos ao Longo do Mês</h3>
              {areaData.length > 0 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={areaData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.primary} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: theme.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: theme.textMuted, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                      tickFormatter={v => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke={theme.primary}
                      strokeWidth={2.5}
                      fill="url(#areaGrad)"
                      dot={{ r: 3, fill: theme.primary, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: theme.accent, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </div>
          </div>

          {/* Top 10 Estabelecimentos – COR DA CATEGORIA */}
          <div className="card p-5" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <h3 className="font-display font-semibold mb-5" style={{ color: theme.text }}>Top 10 Estabelecimentos</h3>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(barData.length * 36, 200)}>
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 44, top: 2, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: theme.textMuted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: theme.textMuted, fontSize: 11 }}
                    width={150}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="valor" radius={[0, 8, 8, 0]} maxBarSize={26}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>

          {/* Detalhamento por categoria */}
          <div className="card overflow-hidden" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <div className="px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <h3 className="font-display font-semibold" style={{ color: theme.text }}>Detalhamento por Categoria</h3>
            </div>
            {porCategoria.filter(c => parseFloat(c.total_gasto) > 0).map((c, i) => {
              const cor = c.cor || CHART_COLORS[i % CHART_COLORS.length]
              return (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-800/50"
                  style={{ borderBottom: `1px solid ${theme.border}` }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${cor}20`, color: cor }}
                  >
                    {c.icone || '💳'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm" style={{ color: theme.text }}>
                        {c.categoria || 'Sem categoria'}
                      </span>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <span className="text-xs tabular-nums" style={{ color: theme.textDim }}>{c.total_transacoes} lanç.</span>
                        <span className="text-xs font-semibold tabular-nums w-10 text-right" style={{ color: cor }}>
                          {formatPercent(c.total_gasto, totais.total_gasto)}
                        </span>
                        <span className="font-mono font-bold text-sm tabular-nums" style={{ color: theme.text }}>
                          {formatCurrency(c.total_gasto)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: formatPercent(c.total_gasto, totais.total_gasto),
                          background: `linear-gradient(90deg, ${cor}, ${cor}99)`
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TRANSAÇÕES */}
      {tab === 'transacoes' && (
        <div className="space-y-4 animate-fade-up">
          {/* Filtros */}
          <div className="card p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <div className="flex flex-wrap gap-3">
              <input
                className="input flex-1 min-w-48"
                placeholder="🔍 Buscar descrição ou estabelecimento..."
                value={filtros.busca}
                onChange={e => setFiltros(f => ({ ...f, busca: e.target.value, page: 1 }))}
              />
              <select
                className="input"
                value={filtros.categoria}
                onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value, page: 1 }))}
                style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
              >
                <option value="">Todas as categorias</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>
                ))}
              </select>
              <select
                className="input"
                value={filtros.tipo}
                onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value, page: 1 }))}
                style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
              >
                <option value="">Todos os tipos</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="estorno">Estorno</option>
              </select>
              <select
                className="input"
                value={`${filtros.order}_${filtros.dir}`}
                onChange={e => {
                  const [o, d] = e.target.value.split('_')
                  setFiltros(f => ({ ...f, order: o, dir: d, page: 1 }))
                }}
                style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
              >
                <option value="data_desc">Data ↓</option>
                <option value="data_asc">Data ↑</option>
                <option value="valor_desc">Valor ↓</option>
                <option value="valor_asc">Valor ↑</option>
              </select>
            </div>

            {(filtros.busca || filtros.categoria || filtros.tipo) && (
              <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
                <span className="text-xs" style={{ color: theme.textDim }}>Filtros ativos:</span>
                {filtros.busca && <span className="badge text-xs" style={{ background: `${theme.primary}15`, color: theme.primary }}>"{filtros.busca}"</span>}
                {filtros.categoria && (
                  <span className="badge text-xs" style={{ background: `${theme.success}15`, color: theme.success }}>
                    {categorias.find(c => c.id === filtros.categoria)?.nome}
                  </span>
                )}
                {filtros.tipo && (
                  <span className="badge text-xs" style={{ background: `${theme.warning}15`, color: theme.warning }}>
                    {filtros.tipo}
                  </span>
                )}
                <button
                  onClick={() => setFiltros(f => ({ ...f, busca: '', categoria: '', tipo: '', page: 1 }))}
                  className="text-xs ml-auto text-slate-500 hover:text-slate-300"
                >
                  Limpar ✕
                </button>
              </div>
            )}
          </div>

          {/* Tabela de transações */}
          <div className="card overflow-hidden" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Data', 'Descrição', 'Categoria', 'Parcelas', 'Valor'].map((h, i) => (
                      <th
                        key={h}
                        className={clsx('py-3 px-5 text-xs font-semibold uppercase tracking-wider', i === 4 ? 'text-right' : 'text-left')}
                        style={{ color: theme.textMuted }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transacoes.map((t, idx) => (
                    <tr
                      key={t.id}
                      className="group transition-colors"
                      style={{
                        borderBottom: `1px solid ${theme.border}`,
                        background: idx % 2 !== 0 ? theme.hover : 'transparent'
                      }}
                    >
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs tabular-nums" style={{ color: theme.textDim }}>{formatDate(t.data)}</span>
                      </td>
                      <td className="px-5 py-3 max-w-xs">
                        <p className="font-medium truncate" style={{ color: theme.text }}>{t.descricao}</p>
                        {t.estabelecimento && t.estabelecimento !== t.descricao && (
                          <p className="text-xs truncate mt-0.5" style={{ color: theme.textDim }}>{t.estabelecimento}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {editCategoria?.id === t.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              className="input text-xs py-1"
                              defaultValue={t.categoria_id || ''}
                              onChange={e => handleCategoria(t.id, e.target.value || null)}
                              autoFocus
                              style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
                            >
                              <option value="">Sem categoria</option>
                              {categorias.map(c => (
                                <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>
                              ))}
                            </select>
                            <button onClick={() => setEditCategoria(null)} className="text-xs w-5 h-5 flex items-center justify-center rounded" style={{ color: theme.textDim }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setEditCategoria({ id: t.id })} className="flex items-center gap-1.5 group/cat">
                            {t.categoria_nome ? (
                              <span
                                className="badge text-xs font-medium"
                                style={{
                                  background: `${t.categoria_cor}20`,
                                  color: t.categoria_cor,
                                  border: `1px solid ${t.categoria_cor}30`
                                }}
                              >
                                {t.categoria_icone} {t.categoria_nome}
                              </span>
                            ) : (
                              <span
                                className="badge text-xs"
                                style={{ background: theme.badgeBg, color: theme.inactiveTabText, border: `1px solid ${theme.badgeBorder}` }}
                              >
                                Sem categoria
                              </span>
                            )}
                            <span className="text-xs opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: theme.textDim }}>✏️</span>
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {t.parcelas_total > 1 ? (
                          <span
                            className="badge text-xs font-mono"
                            style={{ background: theme.badgeBg, color: theme.inactiveTabText, border: `1px solid ${theme.badgeBorder}` }}
                          >
                            {t.parcela_atual}/{t.parcelas_total}
                          </span>
                        ) : (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className="font-mono font-bold text-sm tabular-nums"
                          style={{ color: t.tipo !== 'debito' ? theme.success : theme.text }}
                        >
                          {t.tipo !== 'debito' && '+ '}
                          {formatCurrency(t.valor)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {transacoes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-16">
                        <div className="text-3xl mb-2">🔍</div>
                        <p className="text-sm" style={{ color: theme.textDim }}>Nenhuma transação encontrada</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalTrans > 30 && (
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${theme.border}` }}>
                <span className="text-xs" style={{ color: theme.textDim }}>{totalTrans} transações</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={filtros.page <= 1}
                    onClick={() => setFiltros(f => ({ ...f, page: f.page - 1 }))}
                    className="btn-ghost text-xs disabled:opacity-30 px-3 py-1.5"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs tabular-nums px-2" style={{ color: theme.textMuted }}>
                    {filtros.page} / {Math.ceil(totalTrans / 30)}
                  </span>
                  <button
                    disabled={filtros.page >= Math.ceil(totalTrans / 30)}
                    onClick={() => setFiltros(f => ({ ...f, page: f.page + 1 }))}
                    className="btn-ghost text-xs disabled:opacity-30 px-3 py-1.5"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-40 gap-2">
      <div className="text-3xl opacity-30">📊</div>
      <p className="text-xs" style={{ color: '#64748B' }}>Sem dados para exibir</p>
    </div>
  )
}