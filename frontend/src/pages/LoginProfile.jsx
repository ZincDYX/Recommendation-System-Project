import { useState } from 'react'
import './LoginProfile.css'

function LoginProfile({
  profile,
  setProfile,
  sessionEvents = [],
  datasets = [],
  onLogin,
  onLogout,
  onBrowseMovies,
  loginMessage = '',
  loginLoading = false,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [loginForm, setLoginForm] = useState({
    dataset: profile.dataset || 'MovieLens',
    userId: '',
    password: '',
  })
  const datasetOptions = datasets.length > 0 ? datasets : [profile.dataset || 'MovieLens']

  function handleChange(event) {
    const { name, value } = event.target

    setProfile({
      ...profile,
      [name]: value,
    })
  }

  function handleSave() {
    setIsEditing(false)
  }

  function handleLoginChange(event) {
    const { name, value } = event.target
    setLoginForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleLoginSubmit(event) {
    event.preventDefault()
    onLogin?.(loginForm)
  }

  function activityText(event) {
    if (event.action === 'add') return `${event.title} added`
    if (event.action === 'view') return `${event.title} viewed`
    if (event.action === 'search') return `searched "${event.title}"`
    return `${event.title} ${event.action}`
  }

  if (!profile.isLoggedIn) {
    return (
      <div className="profile-page">
        <section className="profile-card login-card">
          <h1>Login</h1>
          <p className="login-help">Dataset users use their user ID. The demo password is 0.</p>

          <form className="login-form" onSubmit={handleLoginSubmit}>
            <label>
              Dataset
              <select
                name="dataset"
                value={loginForm.dataset}
                onChange={handleLoginChange}
              >
                {datasetOptions.map((dataset) => (
                  <option key={dataset} value={dataset}>{dataset}</option>
                ))}
              </select>
            </label>

            <label>
              User ID
              <input
                name="userId"
                value={loginForm.userId}
                onChange={handleLoginChange}
                placeholder="Enter user ID or tester"
              />
            </label>

            <label>
              Password
              <input
                name="password"
                type="password"
                value={loginForm.password}
                onChange={handleLoginChange}
                placeholder="0"
              />
            </label>

            <button type="submit" disabled={loginLoading}>
              {loginLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <p className="login-message">{loginMessage}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <section className="profile-card">
        <div className="profile-header">
          <div className="avatar-area">
            <div className="profile-avatar">
              <span>👤</span>
            </div>
          </div>

          <div className="profile-main">
            {isEditing ? (
              <input
                className="profile-input name-input"
                name="name"
                value={profile.name}
                onChange={handleChange}
              />
            ) : (
              <h2>{profile.name}</h2>
            )}

            <p>Recommendation signals are used on the storefront and experiment views.</p>
          </div>

          <div className="profile-actions">
            <button className="browse-btn" onClick={onBrowseMovies}>
              Browse Movies
            </button>

            <button
              className="edit-profile-btn"
              onClick={() => {
                isEditing ? handleSave() : setIsEditing(true)
              }}
            >
              {isEditing ? 'Save' : 'Edit'}
            </button>

            <button className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        <div className="profile-info">
          <h3>Account</h3>
          <div className="account-grid">
            <span>Dataset</span>
            <strong>{profile.dataset}</strong>
            <span>User ID</span>
            <strong>{profile.userId}</strong>
            <span>Training History</span>
            <strong>{profile.historyCount} items</strong>
          </div>
        </div>

        <div className="profile-info">
          <h3>Session Activity</h3>

          {sessionEvents.length === 0 && (
            <p>No store activity has been recorded in this session.</p>
          )}

          {sessionEvents.slice(0, 10).map((event) => (
            <div className="order-item" key={`${event.timestamp}-${event.action}-${event.itemId}`}>
              <span>{activityText(event)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default LoginProfile
