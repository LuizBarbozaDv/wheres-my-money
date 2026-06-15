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
              className="card p-5 cursor-pointer hover:border-white/10 hover:bg-white/[0.03] transition-all duration-200 group overflow-hidden"
            >
              {/* Topo: nome e badge do cartão (se existir) */}
              <div className="flex flex-col min-w-0 mb-3">
                <h3 className="font-display font-semibold text-white text-lg truncate w-full">
                  {f.nome}
                </h3>
                {f.cartao && (
                  <span className="badge bg-white/5 text-slate-400 text-xs mt-1 truncate w-fit">
                    {f.cartao}
                  </span>
                )}
              </div>

              {/* Linha única com mês, valor total, transações e lixeira */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span className="text-slate-400 text-sm whitespace-nowrap">{formatMonth(f.mes_referencia)}</span>
                  <span className="text-white font-mono font-semibold text-base whitespace-nowrap">
                    {formatCurrency(f.total_gasto)}
                  </span>
                  <span className="text-slate-300 text-sm whitespace-nowrap">
                    {f.total_transacoes} transações
                  </span>
                </div>

                <button
                  onClick={(e) => handleDelete(e, f.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors text-base px-2 py-1 rounded-lg hover:bg-red-500/10 flex-shrink-0"
                  title="Excluir fatura"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}