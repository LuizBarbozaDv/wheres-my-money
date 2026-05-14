import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area
} from 'recharts'
import { faturasApi, transacoesApi, categoriasApi } from '../utils/api'
import { formatCurrency, formatDate, formatMonth, formatPercent } from '../utils/format'
import StatCard from '../components/StatCard'
import clsx from 'clsx'

const CHART_COLORS = ['#4361ee','#7b2ff7','#f72585','#fb923c','#22c55e','#06b6d4','#f59e0b','#ec4899','#84cc16','#8b5cf6','#14b8a6','#94a3b8']

export default function FaturaDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [fatura, setFatura] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [transacoes, setTransacoes] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumo') // resumo | transacoes
  const [filtros, setFiltros] = useState({ busca: '', categoria: '', tipo: '', order: 'data', dir: 'desc', page: 1 })
  const [totalTrans, setTotalTrans] = useState(0)
  const [editCategoria, setEditCategoria] = useState(null) // { transacaoId, atual }

  const carregarBase = useCallback(async () => {
    try {
      const [f, r, cats] = await Promise.all([
        faturasApi.buscar(id),
        faturasApi.resumo(id),
        categoriasApi.listar(),
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
      const res = await transacoesApi.listar(id, {
        busca: filtros.busca,
        categoria: filtros.categoria,
        tipo: filtros.tipo,
        order: filtros.order,
        dir: filtros.dir,
        page: filtros.page,
        limit: 30,
      })
      setTransacoes(res.data)
      setTotalTrans(res.total)
    } catch (e) {
      console.error(e)
    }
  }, [id, filtros])

  useEffect(() => {
    setLoading(true)
    Promise.all([carregarBase()]).finally(() => setLoading(false))
  }, [carregarBase])

  useEffect(() => {
    if (tab === 'transacoes') carregarTransacoes()
  }, [tab, carregarTransacoes])

  const handleCategoria = async (transacaoId, categoriaId) => {
    await transacoesApi.atualizarCategoria(transacaoId, categoriaId)
    setEditCategoria(null)
    carregarTransacoes()
    carregarBase()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-400 animate-pulse text-lg">Carregando fatura...</div>
    </div>
  )

  if (!fatura) return (
    <div className="text-center py-20">
      <p className="text-slate-400">Fatura não encontrada</p>
      <button onClick={() => navigate('/')} className="btn-ghost mt-4">← Voltar</button>
    </div>
  )

  const totais = resumo?.totais || {}
  const porCategoria = resumo?.por_categoria || []
  const porEstab = resumo?.por_estabelecimento || []
  const porDia = resumo?.por_dia || []

  // Pie data
  const pieData = porCategoria
    .filter(c => parseFloat(c.total_gasto) > 0)
    .map((c, i) => ({
      name: `${c.icone || '💳'} ${c.categoria || 'Sem categoria'}`,
      value: parseFloat(c.total_gasto),
      color: c.cor || CHART_COLORS[i % CHART_COLORS.length],
    }))

  // Bar top estabelecimentos
  const barData = porEstab.slice(0, 10).map(e => ({
    name: (e.estabelecimento || 'Desconhecido').substring(0, 22),
    valor: parseFloat(e.total_gasto),
    count: e.total_transacoes,
  }))

  // Area por dia
  const areaData = porDia.map(d => ({
    dia: formatDate(d.dia).substring(0, 5),
    total: parseFloat(d.total),
  }))

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-surface-900 border border-white/10 rounded-xl p-3 shadow-xl text-sm">
        <p className="text-slate-400 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="font-mono font-semibold text-white">{formatCurrency(p.value)}</p>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/')} className="btn-ghost mt-1 text-sm flex-shrink-0">
          ← Voltar
        </button>
        <div>
          <h1 className="text-2xl font-display font-bold text-white">{fatura.nome}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="badge bg-brand-500/15 text-brand-400">{formatMonth(fatura.mes_referencia)}</span>
            {fatura.cartao && <span className="badge bg-white/5 text-slate-400">{fatura.cartao}</span>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-stagger">
        <StatCard icon="💸" label="Total Gasto" value={formatCurrency(totais.total_gasto)} color="red" />
        <StatCard icon="🔢" label="Transações" value={totais.total_transacoes} color="blue" />
        <StatCard icon="🎯" label="Ticket Médio" value={formatCurrency(totais.ticket_medio)} color="purple" />
        <StatCard icon="⬆️" label="Maior Gasto" value={formatCurrency(totais.maior_gasto)} color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-900 border border-white/5 rounded-xl w-fit">
        {[['resumo','📊 Resumo'],['transacoes','📋 Transações']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'px-5 py-2 rounded-lg text-sm font-medium transition-all',
              tab === key ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* RESUMO TAB */}
      {tab === 'resumo' && (
        <div className="space-y-6 animate-fade-up">
          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie: Por categoria */}
            <div className="card p-5">
              <h3 className="font-display font-semibold text-white mb-5">Gastos por Categoria</h3>
              {pieData.length > 0 ? (
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        paddingAngle={3} dataKey="value">
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2 w-full">
                    {pieData.slice(0, 7).map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                          <span className="text-slate-300 truncate">{d.name}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="font-mono text-white text-xs">{formatCurrency(d.value)}</span>
                          <span className="text-slate-500 text-xs ml-1">
                            {formatPercent(d.value, totais.total_gasto)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Sem dados</p>
              )}
            </div>

            {/* Area: Gastos por dia */}
            <div className="card p-5">
              <h3 className="font-display font-semibold text-white mb-5">Gastos ao Longo do Mês</h3>
              {areaData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={areaData}>
                    <defs>
                      <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4361ee" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4361ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="total" stroke="#4361ee" strokeWidth={2} fill="url(#gradBlue)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 text-sm">Sem dados</p>
              )}
            </div>
          </div>

          {/* Bar: Top estabelecimentos */}
          <div className="card p-5">
            <h3 className="font-display font-semibold text-white mb-5">Top 10 Estabelecimentos</h3>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={140} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="valor" fill="#4361ee" radius={[0, 6, 6, 0]}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-sm">Sem dados</p>
            )}
          </div>

          {/* Category table */}
          <div className="card overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="font-display font-semibold text-white">Detalhamento por Categoria</h3>
            </div>
            <div className="divide-y divide-white/5">
              {porCategoria.filter(c => parseFloat(c.total_gasto) > 0).map((c, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: `${c.cor}20`, color: c.cor }}
                  >
                    {c.icone || '💳'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-200 font-medium text-sm">{c.categoria || 'Sem categoria'}</span>
                      <span className="font-mono text-white font-semibold text-sm">{formatCurrency(c.total_gasto)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-white/5 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: formatPercent(c.total_gasto, totais.total_gasto),
                            background: c.cor || '#4361ee',
                          }}
                        />
                      </div>
                      <span className="text-slate-500 text-xs w-10 text-right">
                        {formatPercent(c.total_gasto, totais.total_gasto)}
                      </span>
                      <span className="text-slate-600 text-xs w-16 text-right">
                        {c.total_transacoes} lanç.
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TRANSAÇÕES TAB */}
      {tab === 'transacoes' && (
        <div className="space-y-4 animate-fade-up">
          {/* Filtros */}
          <div className="card p-4 flex flex-wrap gap-3">
            <input
              className="input flex-1 min-w-40"
              placeholder="🔍 Buscar descrição ou estabelecimento..."
              value={filtros.busca}
              onChange={e => setFiltros(f => ({ ...f, busca: e.target.value, page: 1 }))}
            />
            <select
              className="input"
              value={filtros.categoria}
              onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value, page: 1 }))}
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
                const [order, dir] = e.target.value.split('_')
                setFiltros(f => ({ ...f, order, dir, page: 1 }))
              }}
            >
              <option value="data_desc">Data ↓</option>
              <option value="data_asc">Data ↑</option>
              <option value="valor_desc">Valor ↓</option>
              <option value="valor_asc">Valor ↑</option>
            </select>
          </div>

          {/* Tabela */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-5 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Data</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Descrição</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Categoria</th>
                    <th className="text-left px-5 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Parcelas</th>
                    <th className="text-right px-5 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {transacoes.map(t => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">
                        {formatDate(t.data)}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-200">{t.descricao}</p>
                        {t.estabelecimento && t.estabelecimento !== t.descricao && (
                          <p className="text-slate-500 text-xs">{t.estabelecimento}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {editCategoria?.id === t.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              className="input text-xs py-1.5"
                              defaultValue={t.categoria_id || ''}
                              onChange={e => handleCategoria(t.id, e.target.value || null)}
                            >
                              <option value="">Sem categoria</option>
                              {categorias.map(c => (
                                <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>
                              ))}
                            </select>
                            <button onClick={() => setEditCategoria(null)} className="text-slate-500 hover:text-white">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditCategoria({ id: t.id })}
                            className="flex items-center gap-1.5 group/cat"
                          >
                            {t.categoria_nome ? (
                              <span
                                className="badge text-xs"
                                style={{ background: `${t.categoria_cor}20`, color: t.categoria_cor }}
                              >
                                {t.categoria_icone} {t.categoria_nome}
                              </span>
                            ) : (
                              <span className="badge bg-white/5 text-slate-500 text-xs">Sem categoria</span>
                            )}
                            <span className="text-slate-600 group-hover/cat:text-slate-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500 text-xs font-mono">
                        {t.parcelas_total > 1 ? `${t.parcela_atual}/${t.parcelas_total}` : '—'}
                      </td>
                      <td className={clsx(
                        'px-5 py-3 text-right font-mono font-semibold',
                        t.tipo === 'debito' ? 'text-white' : 'text-emerald-400'
                      )}>
                        {t.tipo !== 'debito' && '+ '}
                        {formatCurrency(t.valor)}
                      </td>
                    </tr>
                  ))}
                  {transacoes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-500">
                        Nenhuma transação encontrada
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalTrans > 30 && (
              <div className="border-t border-white/5 px-5 py-3 flex items-center justify-between">
                <span className="text-slate-500 text-sm">{totalTrans} transações</span>
                <div className="flex gap-2">
                  <button
                    disabled={filtros.page <= 1}
                    onClick={() => setFiltros(f => ({ ...f, page: f.page - 1 }))}
                    className="btn-ghost text-sm disabled:opacity-30"
                  >
                    ← Anterior
                  </button>
                  <span className="text-slate-400 text-sm flex items-center px-2">
                    {filtros.page} / {Math.ceil(totalTrans / 30)}
                  </span>
                  <button
                    disabled={filtros.page >= Math.ceil(totalTrans / 30)}
                    onClick={() => setFiltros(f => ({ ...f, page: f.page + 1 }))}
                    className="btn-ghost text-sm disabled:opacity-30"
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
