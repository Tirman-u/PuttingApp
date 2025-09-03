import App from './App'
import Spectator from './screens/Spectator'

export default function AppRoot() {
  const screenId = new URLSearchParams(window.location.search).get('screen')
  if (screenId) return <Spectator sessionId={screenId} />
  return <App />
}
