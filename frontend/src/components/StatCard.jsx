export default function StatCard({ icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-emerald-500/10 text-emerald-400',
    red: 'bg-red-500/10 text-red-400',
    purple: 'bg-purple-500/10 text-purple-400',
    amber: 'bg-amber-500/10 text-amber-400',
  }

  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${colors[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
        <p className="text-white font-display font-bold text-xl leading-tight truncate">{value}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
