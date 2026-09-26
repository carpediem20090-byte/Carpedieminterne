import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const tabs = [
  { to: '/', label: 'Accueil', icon: '🏠', end: true },
  { to: '/releve', label: 'Relève', icon: '📋' },
  { to: '/colis', label: 'Colis', icon: '📦' },
  { to: '/planning', label: 'Planning', icon: '🗓️' },
  { to: '/plus', label: 'Plus', icon: '➕' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="bg-havane text-white px-4 py-3 flex items-center justify-between"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <span className="font-semibold">Carpe Diem — Gestion</span>
        <div className="flex items-center gap-3 text-sm">
          {profile && <span className="text-white/80">{profile.full_name}</span>}
          <button onClick={() => signOut()} className="text-white/80 underline">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] leading-tight font-medium px-0.5 ${
                isActive ? 'text-havane' : 'text-encre/50'
              }`
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
