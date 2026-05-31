import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDisplayName(data.displayName ?? '');
        setPhotoURL(data.photoURL ?? '');
      }
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await updateDoc(doc(db, 'users', user.uid), { displayName, photoURL });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="profile-page">
      <header className="lobby-header">
        <button className="btn-text" onClick={() => navigate('/')}>← Back to Lobby</button>
      </header>
      <div className="profile-card">
        <h2>Profile</h2>
        <div className="profile-avatar-row">
          <img
            src={photoURL || user?.photoURL || ''}
            alt="Your avatar"
            className="profile-avatar"
            onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
          />
        </div>
        <div className="form-row">
          <label htmlFor="display-name">Display Name</label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
          />
        </div>
        <div className="form-row">
          <label htmlFor="photo-url">Avatar URL</label>
          <input
            id="photo-url"
            type="url"
            value={photoURL}
            onChange={(e) => setPhotoURL(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
