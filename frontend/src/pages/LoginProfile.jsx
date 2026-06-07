import { useState } from 'react'
import './LoginProfile.css'

function LoginProfile() {
  const [isEditing, setIsEditing] = useState(false)

  const [profile, setProfile] = useState({
    name: 'Guest User',
    address: 'Beijing, China',
    avatar: '',
  })

  function handleChange(event) {
    const { name, value } = event.target

    setProfile({
      ...profile,
      [name]: value,
    })
  }

  function handleSave() {
    setIsEditing(false)

    // Later: call backend API here
    // await updateUserProfile(profile)
  }

  function handleAvatarChange(event) {
    const file = event.target.files[0]

    if (!file) return

    const imageUrl = URL.createObjectURL(file)

    setProfile({
        ...profile,
        avatar: imageUrl,
    })
  }

  return (
    <div className="profile-page">
      <section className="profile-card">
        <div className="profile-header">
          <div className="avatar-area">
          <div className="profile-avatar">
              {profile.avatar ? (
              <img src={profile.avatar}
                   alt="profile"/>) : (<span>👤</span>)}
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

            <p>Not connected to backend yet</p>
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
          <h3>Order History</h3>

          <div className="order-item">
            <span>Casual Hoodie</span>
            <span>¥129</span>
          </div>

          <div className="order-item">
            <span>Sport Shoes</span>
            <span>¥299</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default LoginProfile