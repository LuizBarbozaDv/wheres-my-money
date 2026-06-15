import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { faturasApi } from '../utils/api'
import { formatCurrency, formatMonth } from '../utils/format'
import UploadFatura from '../components/UploadFatura'

export default function Home() {
  const [faturas, setFaturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const navigate = useNavigate()

  const carregar = async () => {
    setLoading(true)
    try {
      const data = await faturasApi.listar()
      setFaturas(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Excluir esta fatura e todas as transações?')) return
    await faturasApi.deletar(id)
    carregar()
  }

  const handleUploadSuccess = (result) => {
    setShowUpload(false)
    navigate(`/fatura/${result.fatura.id}`)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Suas Faturas</h1>
          <p className="text-slate-400 mt-1">Importe e analise seus gastos por categoria e estabelecimento</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="btn-primary flex-shrink-0 flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          Nova Fatura
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="card p-6 animate-fade-up">
          <h2 className="font-display font-semibold text-lg mb-4">Importar Nova Fatura</h2>
          <UploadFatura onSuccess={handleUploadSuccess} />
        </div>
      )}

      {/* Faturas list */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 h-36 animate-pulse bg-surface-800/60" />
          ))}
        </div>
      ) : faturas.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">📂</div>
          <h3 className="font-display font-semibold text-xl text-white mb-2">Nenhuma fatura ainda</h3>
          <p className="text-slate-400 mb-6">Importe seu primeiro arquivo CSV, PDF ou OFX para começar</p>
          <button onClick={() => setShowUpload(true)} className="btn-primary mx-auto">
            Importar Fatura
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-stagger">
          {faturas.map(f => (
            <div
              key={f.id}
              onClick={() => navigate(`/fatura/${f.id}`)}
              className="card p-5 cursor-pointer hover:border-white/10 hover:bg-white/[0.03] transition-all duration-200 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center text-lg">
                  💳
                </div>
                <button
                  onClick={(e) => handleDelete(e, f.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all text-sm px-2 py-1 rounded-lg hover:bg-red-500/10"
                >
                  🗑
                </button>
              </div>

              <h3 className="font-display font-semibold text-white mb-1 truncate">{f.nome}</h3>
              {f.cartao && (
                <span className="badge bg-white/5 text-slate-400 mb-3">{f.cartao}</span>
              )}

              <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-xs">{formatMonth(f.mes_referencia)}</p>
                  <p className="text-white font-mono font-semibold">{formatCurrency(f.total_gasto)}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-xs">Transações</p>
                  <p className="text-slate-300 font-semibold">{f.total_transacoes}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
