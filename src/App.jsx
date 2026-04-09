import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './index.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [resetMode, setResetMode] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') setResetMode(true)
    })
  }, [])

  if (resetMode && session) {
    return <ResetPassword onDone={() => setResetMode(false)} />
  }

  if (!session) {
    return <Login />
  }

  return <MainApp session={session} />
}

function MainApp({ session }) {
  const [entries, setEntries] = useState([])
  const [friendEntries, setFriendEntries] = useState([])
  const [foodName, setFoodName] = useState('')
  const [location, setLocation] = useState('')
  const [review, setReview] = useState('')
  const [rating, setRating] = useState(5)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [activeTab, setActiveTab] = useState('reviews')
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [sentRequests, setSentRequests] = useState([])
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchMessage, setSearchMessage] = useState('')
  const [friendProfiles, setFriendProfiles] = useState({})

  const userId = session.user.id

  useEffect(() => {
    fetchEntries()
    fetchFriendships()
  }, [])

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) console.error('Fetch error:', error.message)
    setEntries(data || [])
  }

  const fetchFriendships = async () => {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
    if (error) {
      console.error('Friendships error:', error.message)
      return
    }

    const accepted = []
    const pending = []
    const sent = []

    for (const f of (data || [])) {
      if (f.status === 'accepted') {
        accepted.push(f)
      } else if (f.status === 'pending' && f.addressee_id === userId) {
        pending.push(f)
      } else if (f.status === 'pending' && f.requester_id === userId) {
        sent.push(f)
      }
    }

    const friendIds = accepted.map(f =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    )
    const pendingIds = pending.map(f => f.requester_id)
    const sentIds = sent.map(f => f.addressee_id)
    const allIds = [...new Set([...friendIds, ...pendingIds, ...sentIds])]

    if (allIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', allIds)
      const profileMap = {}
      for (const p of (profiles || [])) {
        profileMap[p.id] = p
      }
      setFriendProfiles(profileMap)
    }

    setFriends(accepted)
    setPendingRequests(pending)
    setSentRequests(sent)

    if (friendIds.length > 0) {
      const { data: fEntries } = await supabase
        .from('food_entries')
        .select('*')
        .in('user_id', friendIds)
        .order('created_at', { ascending: false })
      setFriendEntries(fEntries || [])
    } else {
      setFriendEntries([])
    }
  }

  const searchUser = async () => {
    setSearchResult(null)
    setSearchMessage('')
    if (!searchEmail) return

    if (searchEmail.toLowerCase() === session.user.email.toLowerCase()) {
      setSearchMessage("That's you! 😄")
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', searchEmail.toLowerCase())
      .single()

    if (error || !data) {
      setSearchMessage('No user found with that email')
    } else {
      const existing = [...friends, ...pendingRequests, ...sentRequests].find(f =>
        f.requester_id === data.id || f.addressee_id === data.id
      )
      if (existing) {
        setSearchMessage('You already have a connection with this user')
      } else {
        setSearchResult(data)
      }
    }
  }

  const sendFriendRequest = async (addresseeId) => {
    const { error } = await supabase.from('friendships').insert({
      requester_id: userId,
      addressee_id: addresseeId
    })
    if (error) {
      console.error('Friend request error:', error.message)
    } else {
      setSearchResult(null)
      setSearchEmail('')
      setSearchMessage('✅ Friend request sent!')
      await fetchFriendships()
    }
  }

  const acceptRequest = async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId)
    if (error) console.error('Accept error:', error.message)
    await fetchFriendships()
  }

  const rejectRequest = async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId)
    if (error) console.error('Reject error:', error.message)
    await fetchFriendships()
  }

  const removeFriend = async (friendshipId) => {
    if (!window.confirm('Remove this friend?')) return
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId)
    if (error) console.error('Remove error:', error.message)
    await fetchFriendships()
  }

  const uploadPhoto = async (file) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}/${Date.now()}.${fileExt}`

    const { error } = await supabase.storage
      .from('Food-Photos')
      .upload(fileName, file)

    if (error) {
      console.error('Upload error:', error.message)
      return null
    }

    const { data } = supabase.storage
      .from('Food-Photos')
      .getPublicUrl(fileName)

    return data.publicUrl
  }

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  const removePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const addEntry = async () => {
    if (!foodName) return
    setLoading(true)

    let imageUrl = null
    if (photoFile) {
      imageUrl = await uploadPhoto(photoFile)
    }

    if (editingId) {
      const updateData = { food_name: foodName, location, review, rating }
      if (imageUrl) updateData.image_url = imageUrl
      const { error } = await supabase
        .from('food_entries')
        .update(updateData)
        .eq('id', editingId)
      if (error) console.error('Update error:', error.message)
      setEditingId(null)
    } else {
      const { error } = await supabase.from('food_entries').insert({
        food_name: foodName,
        location,
        review,
        rating,
        image_url: imageUrl,
        user_id: userId
      })
      if (error) console.error('Insert error:', error.message)
    }

    setFoodName('')
    setLocation('')
    setReview('')
    setRating(5)
    setPhotoFile(null)
    setPhotoPreview(null)
    await fetchEntries()
    setLoading(false)
  }

  const startEdit = (entry) => {
    setEditingId(entry.id)
    setFoodName(entry.food_name)
    setLocation(entry.location || '')
    setReview(entry.review || '')
    setRating(entry.rating)
    setPhotoFile(null)
    setPhotoPreview(entry.image_url || null)
    setActiveTab('reviews')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFoodName('')
    setLocation('')
    setReview('')
    setRating(5)
    setPhotoFile(null)
    setPhotoPreview(null)
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

  const getFriendName = (friendUserId) => {
    const profile = friendProfiles[friendUserId]
    return profile ? (profile.display_name || profile.email) : 'Unknown'
  }

  const pendingCount = pendingRequests.length

  return (
    <div className="app-container">
      <div className="header">
        <h1>YumReviews 🍜</h1>
        <button className="btn-logout" onClick={handleLogout}>Log out</button>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
          My Reviews
        </button>
        <button className={`tab ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>
          Friends Feed
        </button>
        <button className={`tab ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>
          Friends {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </button>
      </div>

      {activeTab === 'reviews' && (
        <>
          <div className={`form-card ${editingId ? 'editing' : ''}`}>
            <h2>{editingId ? '✏️ Edit Review' : '➕ Add a Review'}</h2>
            <input className="form-input" type="text" placeholder="Food name" value={foodName} onChange={(e) => setFoodName(e.target.value)} />
            <input className="form-input" type="text" placeholder="📍 Location (e.g. Joe's Pizza, NYC)" value={location} onChange={(e) => setLocation(e.target.value)} />
            <textarea className="form-input" placeholder="Write your review..." value={review} onChange={(e) => setReview(e.target.value)} />

            <div className="photo-upload">
              {photoPreview ? (
                <div className="photo-preview">
                  <img src={photoPreview} alt="Preview" />
                  <button className="photo-remove" onClick={removePhoto}>✕</button>
                </div>
              ) : (
                <label className="photo-upload-label">
                  <span>📷 Add a photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} />
                </label>
              )}
            </div>

            <div className="rating-group">
              <label>Rating: {'⭐'.repeat(rating)}{'☆'.repeat(5 - rating)}</label>
              <input className="rating-slider" type="range" min="1" max="5" value={rating} onChange={(e) => setRating(Number(e.target.value))} />
            </div>
            <div className="btn-row">
              <button className="btn-primary" onClick={addEntry} disabled={loading}>
                {loading ? 'Saving...' : editingId ? 'Save Changes' : 'Add Entry'}
              </button>
              {editingId && <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>}
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
              {entry.location && <p className="entry-location">📍 {entry.location}</p>}
              {entry.image_url && <img className="entry-photo" src={entry.image_url} alt={entry.food_name} />}
              {entry.review && <p className="entry-review">{entry.review}</p>}
              <div className="entry-bottom">
                <small className="entry-date">
                  {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </small>
                <div className="entry-actions">
                  <button className="btn-edit" onClick={() => startEdit(entry)}>✏️ Edit</button>
                  <button className="btn-delete" onClick={() => deleteEntry(entry.id)}>🗑️ Delete</button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {activeTab === 'feed' && (
        <>
          <h2 className="feed-header">Friends' Reviews ({friendEntries.length})</h2>
          {friendEntries.length === 0 && <p className="feed-empty">No friend reviews yet — add some friends! 👋</p>}
          {friendEntries.map((entry) => (
            <div key={entry.id} className="entry-card">
              <div className="entry-top">
                <h3>{entry.food_name}</h3>
                <span className="entry-stars">{'⭐'.repeat(entry.rating)}</span>
              </div>
              <p className="entry-author">by {getFriendName(entry.user_id)}</p>
              {entry.location && <p className="entry-location">📍 {entry.location}</p>}
              {entry.image_url && <img className="entry-photo" src={entry.image_url} alt={entry.food_name} />}
              {entry.review && <p className="entry-review">{entry.review}</p>}
              <div className="entry-bottom">
                <small className="entry-date">
                  {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </small>
              </div>
            </div>
          ))}
        </>
      )}

      {activeTab === 'friends' && (
        <>
          <div className="form-card">
            <h2>🔍 Add a Friend</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="form-input"
                type="email"
                placeholder="Enter their email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                style={{ marginBottom: 0, flex: 1 }}
              />
              <button className="btn-primary" onClick={searchUser}>Search</button>
            </div>
            {searchMessage && (
              <p style={{ marginTop: '0.75rem', color: searchMessage.startsWith('✅') ? '#2e7d32' : '#888', fontSize: '0.9rem' }}>
                {searchMessage}
              </p>
            )}
            {searchResult && (
              <div className="friend-result">
                <span>{searchResult.display_name || searchResult.email}</span>
                <button className="btn-primary" onClick={() => sendFriendRequest(searchResult.id)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}>
                  Send Request
                </button>
              </div>
            )}
          </div>

          {pendingRequests.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 className="feed-header">📬 Pending Requests ({pendingRequests.length})</h2>
              {pendingRequests.map((req) => (
                <div key={req.id} className="friend-card">
                  <span>{getFriendName(req.requester_id)}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-primary" onClick={() => acceptRequest(req.id)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}>
                      Accept
                    </button>
                    <button className="btn-cancel" onClick={() => rejectRequest(req.id)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sentRequests.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 className="feed-header">📤 Sent Requests ({sentRequests.length})</h2>
              {sentRequests.map((req) => (
                <div key={req.id} className="friend-card">
                  <span>{getFriendName(req.addressee_id)}</span>
                  <span style={{ color: '#bbb', fontSize: '0.85rem' }}>Pending...</span>
                </div>
              ))}
            </div>
          )}

          <h2 className="feed-header">👥 My Friends ({friends.length})</h2>
          {friends.length === 0 && <p className="feed-empty">No friends yet — search by email to add someone!</p>}
          {friends.map((f) => {
            const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id
            return (
              <div key={f.id} className="friend-card">
                <span>{getFriendName(friendId)}</span>
                <button className="btn-delete" onClick={() => removeFriend(f.id)}>Remove</button>
              </div>
            )
          })}
        </>
      )}

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
      <input className="form-input" type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      {message && (
        <p className={message.startsWith('✅') ? 'login-success' : 'login-error'}>{message}</p>
      )}
      <button className="btn-primary" onClick={handleReset} style={{ width: '100%' }}>
        Update Password
      </button>
      <p style={{ marginTop: '2rem', color: '#bbb', fontSize: '0.85rem' }}>
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
        <input className="form-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {message && (
          <p className={message.startsWith('✅') ? 'login-success' : 'login-error'}>{message}</p>
        )}
        <button className="btn-primary" onClick={handleForgotPassword} style={{ width: '100%' }}>
          Send Reset Link
        </button>
        <p className="login-switch">
          Remember your password?{' '}
          <button onClick={() => { setIsForgot(false); setMessage('') }}>Back to Log In</button>
        </p>
        <p style={{ marginTop: '2rem', color: '#bbb', fontSize: '0.85rem' }}>
          Made with ❤️ by Mihir Gogri
        </p>
      </div>
    )
  }

  return (
    <div className="login-container">
      <h1>YumReviews 🍜</h1>
      <h2>{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
      <input className="form-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="form-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {message && (
        <p className={message.startsWith('✅') ? 'login-success' : 'login-error'}>{message}</p>
      )}
      <button className="btn-primary" onClick={handleAuth} style={{ width: '100%' }}>
        {isSignUp ? 'Sign Up' : 'Log In'}
      </button>
      {!isSignUp && (
        <p className="login-switch">
          <button onClick={() => { setIsForgot(true); setMessage('') }}>Forgot password?</button>
        </p>
      )}
      <p className="login-switch">
        {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
        <button onClick={() => { setIsSignUp(!isSignUp); setMessage('') }}>
          {isSignUp ? 'Log In' : 'Sign Up'}
        </button>
      </p>
      <p style={{ marginTop: '2rem', color: '#bbb', fontSize: '0.85rem' }}>
        Made with ❤️ by Mihir Gogri
      </p>
    </div>
  )
}