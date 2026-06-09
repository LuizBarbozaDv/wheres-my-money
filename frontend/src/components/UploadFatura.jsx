import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { faturasApi } from '../utils/api'
import clsx from 'clsx'

export default function UploadFatura({ onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nome, setNome] = useState('')
  const [cartao, setCartao] = useState('')
  const [file, setFile] = useState(null)

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) {
      setFile(accepted[0])
      setError(null)
      if (!nome) setNome(accepted[0].name.replace(/\.[^.]+$/, ''))
    }
  }, [nome])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/*': ['.csv', '.txt', '.ofx'] },
    maxFiles: 1,
  })

  const handleUpload = async () => {
    if (!file) return setError('Selecione um arquivo')
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append('nome', nome || file.name)
      if (cartao) fd.append('cartao', cartao)
      const result = await faturasApi.upload(fd)
      onSuccess(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-brand-500 bg-brand-500/10'
            : file
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
        )}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">{file ? '✅' : isDragActive ? '📂' : '📄'}</div>
        {file ? (
          <div>
            <p className="font-medium text-emerald-400">{file.name}</p>
            <p className="text-slate-500 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <p className="text-slate-300 font-medium">
              {isDragActive ? 'Solte o arquivo aqui' : 'Arraste o arquivo ou clique para selecionar'}
            </p>
            <p className="text-slate-500 text-sm mt-1">Suporta CSV, TXT e OFX</p>
          </div>
        )}
      </div>

      {/* Campos opcionais */}
      {file && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Nome da fatura</label>
            <input
              className="input w-full"
              placeholder="Ex: Nubank Abril 2024"
              value={nome}
              onChange={e => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Cartão (opcional)</label>
            <input
              className="input w-full"
              placeholder="Ex: Nubank, Inter, Itaú..."
              value={cartao}
              onChange={e => setCartao(e.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className={clsx(
          'btn-primary w-full flex items-center justify-center gap-2',
          (!file || loading) && 'opacity-50 cursor-not-allowed'
        )}
      >
        {loading ? (
          <>
            <span className="animate-spin text-lg">⟳</span>
            Processando...
          </>
        ) : (
          <>
            <span>Importar Fatura</span>
          </>
        )}
      </button>

      <p className="text-slate-600 text-xs text-center">
        Formatos aceitos: CSV, PDF ou TXT
      </p>
    </div>
  )
}
