import { useState } from 'react'
import { auth, googleProvider } from '../firebase'
import {
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'

export default function SignIn() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Email/Password
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nameForEmail, setNameForEmail] = useState('') // uue konto jaoks

  // Guest
  const [guestName, setGuestName] = useState('')

  async function google() {
    setErr(null)
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e: any) {
      // Safari/iOS/PWA – fallback redirectile
      if (
        e?.code?.startsWith?.('auth/popup') ||
        e?.code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function emailSignIn() {
    setErr(null)
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function emailCreate() {
    if (!nameForEmail.trim()) {
      setErr('Please enter your name.')
      return
    }
    setErr(null)
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      // seadista displayName (hiljem kasutame seda mängija nimena)
      await updateProfile(cred.user, { displayName: nameForEmail.trim() })
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function guest() {
    if (!guestName.trim()) {
      setErr('Please enter your name to continue as Guest.')
      return
    }
    setErr(null)
    setLoading(true)
    try {
      const cred = await signInAnonymously(auth)
      // Pane külge nimi – siis on joinimisel nimi olemas
      await updateProfile(cred.user, { displayName: guestName.trim() })
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto p-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-3">
      <h2 className="text-lg font-semibold text-center">Sign in to PuttApp</h2>

      <button
        className="w-full rounded-2xl bg-sky-500 py-3 font-medium"
        onClick={google}
        disabled={loading}
      >
        Continue with Google
      </button>

      <div className="text-xs text-neutral-500 text-center">or</div>

      {/* Email / Password */}
      <div className="space-y-2">
        <input
          className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-neutral-800 py-2" onClick={emailSignIn} disabled={loading}>
            Sign in
          </button>
          <input
            className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
            placeholder="Your name (new account)"
            value={nameForEmail}
            onChange={(e) => setNameForEmail(e.target.value)}
          />
          <button className="rounded-xl bg-neutral-800 px-3" onClick={emailCreate} disabled={loading}>
            Create
          </button>
        </div>
      </div>

      <div className="text-xs text-neutral-500 text-center">or</div>

      {/* Guest with required name */}
      <div className="space-y-2">
        <input
          className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
          placeholder="Your name (required for Guest)"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
        <button
          className="w-full rounded-2xl bg-neutral-800 py-3"
          onClick={guest}
          disabled={loading || !guestName.trim()}
        >
          Continue as Guest
        </button>
      </div>

      {err && <div className="mt-1 text-sm text-red-400">{err}</div>}

      <p className="text-xs text-neutral-500 text-center">
        If Google popup is blocked, we’ll switch to a full-page sign-in automatically.
      </p>
    </div>
  )
}
