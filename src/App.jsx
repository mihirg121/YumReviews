import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './index.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [foodName, setFoodName] = useState('')
  const [location, setLocation] = useState('')
  const [review, setReview] = useState('')
  const [rating, setRating] = useState(5)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [resetMode, setResetMode] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchEntries()
    })
    supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session) fetchEntries()
      if (event === 'PASSWORD_RECOVERY') {
        setResetMode(true)
      }
    })
  }, [])

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('food_entries')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Fetch error:', error.message)
    setEntries(data || [])
  }

  const addEntry = async () => {
    if (!foodName) return
    setLoading(true)

    if (editingId) {
      const { error } = await supabase
        .from('food_entries')
        .update({ food_name: foodName, location, review, rating })
        .eq('id', editingId)
      if (error) console.error('Update error:', error.message)
      setEditingId(null)
    } else {
      const { error } = await supabase.from('food_entries').insert({
        food_name: foodName,
        location,
        review,
        rating,
        user_id: session.user.id
      })
      if (error) console.error('Insert error:', error.message)
    }

    setFoodName('')
    setLocation('')
    setReview('')
    setRating(5)
    await fetchEntries()
    setLoading(false)
  }

  const startEdit = (entry) => {
    setEditingId(entry.id)
    setFoodName(entry.food_name)
    setLocation(entry.location || '')
    setReview(entry.review || '')
    setRating(entry.rating)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFoodName('')
    setLocation('')
    setReview('')
    setRating(5)
  }

  const deleteEntry = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return
    const { error } = await supabase.from('food_entries').delete().eq('id', id)
    if (error) console.error('Delete error:', error.message)
    await fetchEntries()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (resetMode && session) {
    return <ResetPassword onDone={() => setResetMode(false)} />
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="app-container">
      <div className="header">
        <h1>YumReviews 🍜</h1>
        <button className="btn-logout" onClick={handleLogout}>Log out</button>
      </div>

      <div className={`form-card ${editingId ? 'editing' : ''}`}>
        <h2>{editingId ? '✏️ Edit Review' : '➕ Add a Review'}</h2>
        <input
          className="form-input"
          type="text"
          placeholder="Food name"
          value={foodName}
          onChange={(e) => setFoodName(e.target.value)}
        />
        <input
          className="form-input"
          type="text"
          placeholder="📍 Location (e.g. Joe's Pizza, NYC)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <textarea
          className="form-input"
          placeholder="Write your review..."
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
        <div className="rating-group">
          <label>Rating: {'⭐'.repeat(rating)}{'☆'.repeat(5 - rating)}</label>
          <input
            className="rating-slider"
            type="range"
            min="1"
            max="5"
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
          />
        </div>
        <div className="btn-row">
          <button className="btn-primary" onClick={addEntry} disabled={loading}>
            {loading ? 'Saving...' : editingId ? 'Save Changes' : 'Add Entry'}
          </button>
          {editingId && (
            <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>
          )}
        </div>
      </div>

      <h2 className="feed-header">My Food Log ({entries.length})</h2>
      {entries.length === 0 && <p className="feed-empty">No entries yet — add your first review! 🍕</p>}
      {entries.map((entry) => (
        <div key={entry.id} className={`entry-card ${editingId === entry.id ? 'editing' : ''}`}>
          <div className="entry-top">
            <h3>{entry.food_name}</h3>
            <span className="entry-stars">{'⭐'.repeat(entry.rating)}</span>
          </div>
          {entry.location && (
            <p style={{ color: '#888', fontSize: '0.9rem', margin: '0.25rem 0 0.5rem' }}>
              📍 {entry.location}
            </p>
          )}
          {entry.review && <p className="entry-review">{entry.review}</p>}
          <div className="entry-bottom">
            <small className="entry-date">
              {new Date(entry.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              })}
            </small>
            <div className="entry-actions">
              <button className="btn-edit" onClick={() => startEdit(entry)}>✏️ Edit</button>
              <button className="btn-delete" onClick={() => deleteEntry(entry.id)}>🗑️ Delete</button>
            </div>
          </div>
        </div>
      ))}

      <footer style={{
        textAlign: 'center',
        marginTop: '3rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid #e0d6c8',
        color: '#bbb',
        fontSize: '0.85rem'
      }}>
        Made with ❤️ by Mihir Gogri
      </footer>
    </div>
  )
}

function ResetPassword({ onDone }) {
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleReset = async () => {
    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('✅ Password updated successfully!')
      setTimeout(() => onDone(), 2000)
    }
  }

  return (
    <div className="login-container">
      <h1>YumReviews 🍜</h1>
      <h2>Set your new password</h2>
      <input
        className="form-input"
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      {message && (
        <p className={message.startsWith('✅') ? 'login-success' : 'login-error'}>
          {message}
        </p>
      )}
      <button className="btn-primary" onClick={handleReset} style={{ width: '100%' }}>
        Update Password
      </button>
      <p style={{
        marginTop: '2rem',
        color: '#bbb',
        fontSize: '0.85rem'
      }}>
        Made with ❤️ by Mihir Gogri
      </p>
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgot, setIsForgot] = useState(false)
  const [message, setMessage] = useState('')

  const handleAuth = async () => {
    setMessage('')
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('✅ Check your email to confirm your account!')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    }
  }

  const handleForgotPassword = async () => {
    setMessage('')
    if (!email) {
      setMessage('Please enter your email first')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('✅ Check your email for a password reset link!')
    }
  }

  if (isForgot) {
    return (
      <div className="login-container">
        <h1>YumReviews 🍜</h1>
        <h2>Reset your password</h2>
        <input
          className="form-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {message && (
          <p className={message.startsWith('✅') ? 'login-success' : 'login-error'}>
            {message}
          </p>
        )}
        <button className="btn-primary" onClick={handleForgotPassword} style={{ width: '100%' }}>
          Send Reset Link
        </button>
        <p className="login-switch">
          Remember your password?{' '}
          <button onClick={() => { setIsForgot(false); setMessage('') }}>
            Back to Log In
          </button>
        </p>
        <p style={{
          marginTop: '2rem',
          color: '#bbb',
          fontSize: '0.85rem'
        }}>
          Made with ❤️ by Mihir Gogri
        </p>
      </div>
    )
  }

  return (
    <div className="login-container">
      <h1>YumReviews 🍜</h1>
      <h2>{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
      <input
        className="form-input"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="form-input"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {message && (
        <p className={message.startsWith('✅') ? 'login-success' : 'login-error'}>
          {message}
        </p>
      )}
      <button className="btn-primary" onClick={handleAuth} style={{ width: '100%' }}>
        {isSignUp ? 'Sign Up' : 'Log In'}
      </button>
      {!isSignUp && (
        <p className="login-switch">
          <button onClick={() => { setIsForgot(true); setMessage('') }}>
            Forgot password?
          </button>
        </p>
      )}
      <p className="login-switch">
        {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
        <button onClick={() => { setIsSignUp(!isSignUp); setMessage('') }}>
          {isSignUp ? 'Log In' : 'Sign Up'}
        </button>
      </p>
      <p style={{
        marginTop: '2rem',
        color: '#bbb',
        fontSize: '0.85rem'
      }}>
        Made with ❤️ by Mihir Gogri
      </p>
    </div>
  )
}
