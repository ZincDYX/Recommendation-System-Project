import { useState } from 'react'
import './LoginProfile.css'

function LoginProfile({ profile, setProfile, sessionEvents = [] }) {
  const [isEditing, setIsEditing] = useState(false)

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

  function handleAvatarChange(event) {
    const file = event.target.files[0]

    if (!file) return

    setProfile({
      ...profile,
      avatar: URL.createObjectURL(file),
    })
  }

  return (
    <div className="profile-page">
      <section className="profile-card">
        <div className="profile-header">
          <div className="avatar-area">
            <div className="profile-avatar">
              {profile.avatar ? (
                <img src={profile.avatar} alt="profile" />
              ) : (
                <span>👤</span>
              )}
            </div>

            {isEditing && (
              <label className="change-avatar-btn">
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  hidden
                />
              </label>
            )}
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

          <button
            className="edit-profile-btn"
            onClick={() => {
              isEditing ? handleSave() : setIsEditing(true)
            }}
          >
            {isEditing ? 'Save' : 'Edit'}
          </button>
        </div>

        <div className="profile-info">
          <h3>Address</h3>

          {isEditing ? (
            <input
              className="profile-input"
              name="address"
              value={profile.address}
              onChange={handleChange}
            />
          ) : (
            <p>{profile.address}</p>
          )}
        </div>

        <div className="profile-info">
          <h3>Session Activity</h3>

          {sessionEvents.length === 0 && (
            <p>No store activity has been recorded in this session.</p>
          )}

          {sessionEvents.slice(0, 10).map((event) => (
            <div className="order-item" key={`${event.timestamp}-${event.action}-${event.itemId}`}>
              <span>{event.title}</span>
              <span>{event.action}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default LoginProfile
