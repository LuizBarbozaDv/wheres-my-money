import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import FaturaDetail from './pages/FaturaDetail'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="fatura/:id" element={<FaturaDetail />} />
      </Route>
    </Routes>
  )
}
