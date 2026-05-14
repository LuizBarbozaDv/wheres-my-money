import { Outlet, NavLink } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top navbar */}
      <header className="border-b border-white/5 bg-surface-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-lg">
              💳
            </div>
            <span className="font-display font-bold text-xl tracking-tight">
              Where'sMyMoney<span className="text-brand-500"></span>
            </span>
          </NavLink>
          <span className="text-slate-500 text-sm hidden sm:block">
            Análise inteligente de faturas
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-white/5 py-4 text-center text-slate-600 text-xs">
        Where'sMyMoney © {new Date().getFullYear()}
      </footer>
    </div>
  )
}
