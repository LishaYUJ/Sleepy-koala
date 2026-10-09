import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Trophy, Star, Settings, LogOut, ChevronDown, Clock } from 'lucide-react';
import { useStore } from '../stores/useStore';

import userAvatar from '../assets/user_avatar.jpg';
import { KoalaLogo } from './KoalaLogo';

export const Navbar: React.FC = () => {
  const { nickname, avatarUrl, logout } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Close menus when location changes
  useEffect(() => {
    setAccountMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = nickname || 'Lisha';

  return (
    <nav className="top-navbar-container">
      <style>{`
        .top-navbar-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 80px;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 40px;
          z-index: 100;
        }

        /* Brand Left */
        .brand-section {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }

        .brand-title {
          font-family: var(--font-serif);
          font-size: 1.4rem;
          font-weight: 600;
          color: #f3edd7;
          letter-spacing: 0.02em;
        }

        .nav-center-menu {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(20, 26, 54, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 12px;
          border-radius: 999px;
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }

        .nav-item-link {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #8e9bb4;
          font-family: var(--font-body);
          font-size: 0.95rem;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s ease;
          padding: 8px 16px;
          border-radius: 999px;
        }

        .nav-item-link:hover {
          color: #f3edd7;
          background: rgba(255, 255, 255, 0.05);
        }

        .nav-item-link.active {
          color: #f3edd7;
        }
        
        .nav-item-link.active .nav-icon {
          color: #818cf8;
          filter: drop-shadow(0 0 8px rgba(129, 140, 248, 0.5));
        }

        .nav-icon {
          width: 18px;
          height: 18px;
          transition: color 0.2s ease;
        }

        /* User Profile Right */
        .nav-right-profile {
          position: relative;
          display: flex;
          align-items: center;
        }

        .profile-trigger {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(20, 26, 54, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 14px 6px 6px;
          border-radius: 99px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .profile-trigger:hover {
          background: rgba(20, 26, 54, 0.7);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .nav-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }

        .user-name-text {
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 0.95rem;
          color: #f3edd7;
        }

        /* Account Menu Popover (Downward) */
        .nav-account-popover {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          background: #141a36;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          padding: 8px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: 180px;
        }

        .popover-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          color: #f3edd7;
          font-size: 0.9rem;
          font-weight: 500;
          background: transparent;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
          transition: background 0.15s ease;
        }

        .popover-item:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        .popover-item.logout-item {
          color: #f87171;
        }

        .popover-item.logout-item:hover {
          background: rgba(248, 113, 113, 0.12);
        }
        
        @media (max-width: 768px) {
          .nav-center-menu {
            display: none;
          }
          .nav-right-profile {
            display: none;
          }
          .top-navbar-container {
            position: relative;
            top: auto;
            left: auto;
            right: auto;
            flex: 0 0 72px;
            height: 72px;
            padding: 0 20px;
          }
        }
      `}</style>

      {/* Left: Brand */}
      <NavLink to="/" className="brand-section">
        <KoalaLogo style={{ width: 36, height: 36, color: '#f3edd7' }} />
        <span className="brand-title">Sleepy Koala</span>
      </NavLink>

      {/* Center: Navigation Links */}
      <div className="nav-center-menu">
        <NavLink to="/" className={({ isActive }) => `nav-item-link ${isActive ? 'active' : ''}`}>
          <Home className="nav-icon" />
          <span>Sanctuary</span>
        </NavLink>

        <NavLink to="/history" className={({ isActive }) => `nav-item-link ${isActive ? 'active' : ''}`}>
          <Clock className="nav-icon" />
          <span>History</span>
        </NavLink>

        <NavLink to="/leaderboard" className={({ isActive }) => `nav-item-link ${isActive ? 'active' : ''}`}>
          <Trophy className="nav-icon" />
          <span>Leaderboard</span>
        </NavLink>

        <NavLink to="/badges" className={({ isActive }) => `nav-item-link ${isActive ? 'active' : ''}`}>
          <Star className="nav-icon" />
          <span>Rewards</span>
        </NavLink>
      </div>

      {/* Right: Profile */}
      <div className="nav-right-profile">
        <div className="profile-trigger" onClick={() => setAccountMenuOpen(!accountMenuOpen)}>
          <img src={avatarUrl || userAvatar} alt={`${displayName}'s avatar`} className="nav-avatar" />
          <span className="user-name-text">{displayName}</span>
          <ChevronDown size={16} color="#8e9bb4" />
        </div>

        {accountMenuOpen && (
          <div className="nav-account-popover">
            <button className="popover-item" onClick={() => { setAccountMenuOpen(false); navigate('/settings'); }}>
              <Settings size={16} />
              <span>Settings</span>
            </button>
            <button className="popover-item logout-item" onClick={handleLogout}>
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
