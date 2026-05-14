import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

api.interceptors.response.use(
  r => r,
  err => {
    const msg = err.response?.data?.error || err.message || 'Erro desconhecido'
    return Promise.reject(new Error(msg))
  }
)

export const faturasApi = {
  listar: () => api.get('/faturas').then(r => r.data),
  buscar: (id) => api.get(`/faturas/${id}`).then(r => r.data),
  resumo: (id) => api.get(`/faturas/${id}/resumo`).then(r => r.data),
  upload: (formData) => api.post('/faturas/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data),
  deletar: (id) => api.delete(`/faturas/${id}`).then(r => r.data),
}

export const transacoesApi = {
  listar: (faturaId, params) => api.get(`/faturas/${faturaId}/transacoes`, { params }).then(r => r.data),
  atualizarCategoria: (id, categoria_id) => api.patch(`/transacoes/${id}/categoria`, { categoria_id }).then(r => r.data),
  bulkCategoria: (ids, categoria_id) => api.patch('/transacoes/bulk-categoria', { ids, categoria_id }).then(r => r.data),
}

export const categoriasApi = {
  listar: () => api.get('/categorias').then(r => r.data),
  criar: (data) => api.post('/categorias', data).then(r => r.data),
  atualizar: (id, data) => api.patch(`/categorias/${id}`, data).then(r => r.data),
}

export default api
