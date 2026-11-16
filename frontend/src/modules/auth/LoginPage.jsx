import { useEffect, useState } from 'react'
import { UtensilsCrossed, ChartNoAxesCombined, Users, Boxes, ReceiptText, ChefHat, Wallet, CalendarDays, Truck, Store, ShoppingBag, ShieldCheck } from 'lucide-react'
import { api } from '../../api/client'
import './login.css'

function redirectFor(user) {
  if (user?.must_change_password) return '/app/change-password'
  return user?.role === 'superadmin' ? '/admin/store-monitoring' : '/app/lobby'
}

function BrandLogo() {
  return <span className="login-logo-tile"><img className="login-logo-light" src="/icons/logo-light.png" alt="Orbit OS" /><img className="login-logo-dark" src="/icons/logo-dark.png" alt="Orbit OS" /></span>
}

const businessIcons = [
  [ReceiptText, 'Sales'], [UtensilsCrossed, 'Orders'], [ChefHat, 'Kitchen'],
  [Boxes, 'Inventory'], [ChartNoAxesCombined, 'Analytics'], [Users, 'Team'],
  [Truck, 'Delivery'], [Store, 'Your shop'], [ShoppingBag, 'Products'],
  [ShieldCheck, 'Control'], [Wallet, 'Payments'], [CalendarDays, 'Attendance'],
]

function BusinessIconRows() {
  return <div className="login-icon-rows" aria-hidden="true">
    {[businessIcons.slice(0, 6), businessIcons.slice(6)].map((icons, row) =>
      <div className={`login-icon-row login-icon-row-${row}`} key={row}>
        <div className="login-icon-track">
          {[0, 1].map(copy => <div className="login-icon-group" key={copy}>
            {icons.map(([Icon, label], index) => <div className={`login-business-icon login-icon-color-${index % 4}`} key={label}>
              <Icon size={30} strokeWidth={1.6} /><span>{label}</span>
            </div>)}
          </div>)}
        </div>
      </div>
    )}
  </div>
}

export default function LoginPage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [form, setForm] = useState(() => ({ username: localStorage.getItem('remembered_username') || '', password: '', remember: Boolean(localStorage.getItem('remembered_username')) }))
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api('/api/auth/me').then(({ user }) => { if (active) window.location.replace(redirectFor(user)) }).catch(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    document.cookie = `rms_theme=${dark ? 'dark' : 'light'}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [dark])

  function change(name, value) { setForm(current => ({ ...current, [name]: value })) }

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: { username: form.username.trim(), password: form.password } })
      sessionStorage.setItem('rms_announcement_login_pending', '1')
      if (form.remember) localStorage.setItem('remembered_username', form.username.trim())
      else localStorage.removeItem('remembered_username')
      window.location.replace(redirectFor(result.user))
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Please try again.')
      setLoading(false)
    }
  }

  if (checking) return <main className="login-checking" aria-label="Checking your session"><BrandLogo /><span>Opening your Orbit…</span></main>

  return <main className="orbit-login-page">
    <button className="login-theme-toggle" type="button" onClick={() => setDark(value => !value)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <svg viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4-.7-.7M6.3 6.3l-.7-.7m12.8 0-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> : <svg viewBox="0 0 24 24"><path d="M20.4 15.4A9 9 0 018.6 3.6 9 9 0 1012 21a9 9 0 008.4-5.6z" /></svg>}</button>
    <section className="login-shell">
      <section className="login-visual-panel" aria-label="Orbit OS platform overview">
        <div className="login-branding">
          <a className="login-brand" href="/app/login" aria-label="Orbit OS login"><BrandLogo /><span className="login-wordmark"><strong>ORBIT <span>OS</span></strong><small>by DevForge</small></span></a>
          <p className="login-eyebrow">Business operating system</p>
          <h2 className="login-tagline"><span>Your business.</span><span>In <em>orbit.</em></span></h2>
          <p className="login-brand-description">One clear space for everything that keeps your business moving.</p>
        </div>
        <BusinessIconRows />
        <p className="login-visual-footer">All your operations. One connected space.</p>
      </section>
      <section className="login-access-panel">
        <div className="login-form-wrap">
          <div className="login-heading"><p className="login-workspace-label"><span />Workspace sign in</p><h1>Welcome to Orbit OS</h1><span>Sign in to continue to Orbit OS.</span></div>
          <form onSubmit={submit} autoComplete="off">
            <label><span>Email or username</span><div className="login-input-wrap"><svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 00-16 0m12-13a4 4 0 11-8 0 4 4 0 018 0z" /></svg><input value={form.username} onChange={event => change('username', event.target.value)} autoComplete="off" data-lpignore="true" data-1p-ignore spellCheck="false" placeholder="Enter your email or username" required autoFocus /></div></label>
            <label><span>Password</span><div className="login-input-wrap"><svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0110 0v3M6 10h12v11H6z" /></svg><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => change('password', event.target.value)} autoComplete="new-password" data-lpignore="true" data-1p-ignore placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z" /></svg></button></div></label>
            <div className="login-form-options"><label className="remember-control"><input type="checkbox" checked={form.remember} onChange={event => change('remember', event.target.checked)} /><span>Remember me</span></label><a className="login-forgot-password" href="mailto:support@orbit-os.com">Forgot password?</a></div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="login-submit" disabled={loading}>{loading ? <><span className="login-button-spinner" />Authenticating…</> : <>Sign in <span>→</span></>}</button>
          </form>

        </div>
      </section>
    </section>
  </main>
}