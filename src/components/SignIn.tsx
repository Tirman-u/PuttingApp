
import { signInWithGoogle } from '../firebase'

export default function SignIn(){
  return (
    <div className="mt-10 flex flex-col items-center gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">PuttApp</h1>
      <p className="text-neutral-400 text-center max-w-sm">Minimalist disc golf putting app. Sign in to start a solo session or create a group room to play JYLY.</p>
      <button onClick={signInWithGoogle} className="px-4 py-2 rounded-2xl bg-sky-500 text-white font-medium shadow hover:opacity-90">
        Continue with Google
      </button>
    </div>
  )
}
