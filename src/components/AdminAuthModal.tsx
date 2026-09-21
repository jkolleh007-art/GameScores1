import React, { useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Lock,
  User,
  Key,
  ShieldCheck,
  Database,
  LogOut,
  X,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  UserPlus,
  Server,
  RefreshCw,
} from 'lucide-react';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({ isOpen, onClose }) => {
  const {
    adminUser,
    isAuthenticated,
    databaseInfo,
    login,
    logout,
    changePassword,
    authFetch,
    refreshStatus,
  } = useAdminAuth();

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Management tab: 'profile' | 'password' | 'create_user' | 'database'
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'password' | 'create_user' | 'database'>('profile');

  // Change password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  // Create user state
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'moderator'>('admin');
  const [userCreatedMsg, setUserCreatedMsg] = useState<string | null>(null);
  const [userCreateError, setUserCreateError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);
    try {
      const res = await login(username, password);
      if (!res.success) {
        setLoginError(res.error || 'Login failed. Please check your credentials.');
      } else {
        setUsername('');
        setPassword('');
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFillDefault = () => {
    setUsername('admin');
    setPassword('admin12345');
    setLoginError(null);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changePassword(oldPassword, newPassword);
      if (res.success) {
        setPwSuccess('Password successfully updated!');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwError(res.error || 'Failed to update password');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserCreatedMsg(null);
    setUserCreateError(null);

    if (newUserPassword.length < 6) {
      setUserCreateError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUserCreateError(data.error || 'Failed to create admin user');
      } else {
        setUserCreatedMsg(`Admin user "${newUsername}" created successfully.`);
        setNewUsername('');
        setNewUserPassword('');
      }
    } catch (e: any) {
      setUserCreateError(e.message || 'Failed to create admin user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="admin-auth-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {isAuthenticated ? 'Admin Control & Security' : 'Administrator Sign In'}
                {databaseInfo?.isPostgres && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    PostgreSQL Active
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {isAuthenticated
                  ? `Signed in as ${adminUser?.username} (${adminUser?.role})`
                  : 'Authenticate to manage leagues, Facebook publishing, and system config'}
              </p>
            </div>
          </div>
          <button
            id="close-admin-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {!isAuthenticated ? (
            /* ================= LOGIN VIEW ================= */
            <div className="space-y-4">
              {/* PostgreSQL Connected Notice */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-start space-x-3 text-xs">
                <Database className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <span>Database Engine:</span>
                    <span className="text-emerald-400 font-mono">
                      {databaseInfo?.isPostgres ? 'PostgreSQL (Render)' : 'PostgreSQL Configured'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Admin credentials and daily league settings are persisted directly in PostgreSQL (<code className="text-slate-300 font-mono">gamescores_8n73</code>).
                  </p>
                </div>
              </div>

              {loginError && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Username</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-username-input"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      required
                      autoComplete="username"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Quick Hint / Fill for initial superadmin */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="text-[11px] text-slate-400">
                    <span className="text-slate-300 font-medium">Default Credentials: </span>
                    <code className="text-emerald-400 font-mono">admin</code> / <code className="text-emerald-400 font-mono">admin12345</code>
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickFillDefault}
                    className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                  >
                    Quick Fill
                  </button>
                </div>

                <button
                  id="admin-login-submit-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl transition-all shadow-md active:scale-95 text-sm flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Sign In as Admin</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* ================= AUTHENTICATED MANAGEMENT VIEW ================= */
            <div className="space-y-4">
              {/* Navigation Subtabs */}
              <div className="flex space-x-1 border-b border-slate-800 pb-2">
                {[
                  { id: 'profile', label: 'Admin Status', icon: User },
                  { id: 'database', label: 'Database', icon: Database },
                  { id: 'password', label: 'Security', icon: Key },
                  { id: 'create_user', label: 'Add User', icon: UserPlus },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeSubTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSubTab(tab.id as any)}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Subtab 1: Profile & Session */}
              {activeSubTab === 'profile' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Logged In Account:</span>
                      <span className="text-sm font-bold text-white flex items-center gap-1.5">
                        <User className="w-4 h-4 text-emerald-400" />
                        {adminUser?.username}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Access Role:</span>
                      <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {adminUser?.role}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Permissions:</span>
                      <span className="text-xs text-slate-300">Daily Leagues, Facebook Posts, Sync Engine</span>
                    </div>
                  </div>

                  <button
                    id="admin-logout-btn"
                    onClick={async () => {
                      await logout();
                      onClose();
                    }}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-rose-950/50 hover:text-rose-300 hover:border-rose-800/60 border border-slate-700 text-slate-200 font-semibold rounded-xl transition-all text-sm flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out of Admin Session</span>
                  </button>
                </div>
              )}

              {/* Subtab 2: Database Status */}
              {activeSubTab === 'database' && (
                <div className="space-y-3 text-xs">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Connection Engine:</span>
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        {databaseInfo?.dbType || 'PostgreSQL'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400">PostgreSQL Endpoint:</span>
                      <div className="p-2 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-300 break-all border border-slate-800">
                        {databaseInfo?.databaseUrlMasked || 'postgresql://gamescores_8n73_user:****@dpg-danrl90ae00c739qtqag-a/gamescores_8n73'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Target Host:</span>
                      <span className="font-mono text-slate-300">dpg-danrl90ae00c739qtqag-a</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Database Name:</span>
                      <span className="font-mono text-slate-300">gamescores_8n73</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-[11px] text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-blue-400" />
                      <span>Render Production Synchronization</span>
                    </div>
                    <p>
                      When deployed on Render, the application establishes a direct private network connection to this database instance, synchronizing match records, facebook posts, daily league picks, and admin sessions.
                    </p>
                  </div>
                </div>
              )}

              {/* Subtab 3: Change Password */}
              {activeSubTab === 'password' && (
                <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5 text-xs">
                  {pwSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{pwSuccess}</span>
                    </div>
                  )}

                  {pwError && (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{pwError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="At least 6 characters"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="Confirm new password"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-semibold rounded-xl transition-all cursor-pointer text-sm"
                  >
                    {isSubmitting ? 'Updating Password...' : 'Save New Password'}
                  </button>
                </form>
              )}

              {/* Subtab 4: Create Additional Admin User */}
              {activeSubTab === 'create_user' && (
                <form onSubmit={handleCreateUserSubmit} className="space-y-3.5 text-xs">
                  {userCreatedMsg && (
                    <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{userCreatedMsg}</span>
                    </div>
                  )}

                  {userCreateError && (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{userCreateError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">New Username</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                      placeholder="e.g. editor1"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Temporary Password</label>
                    <input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      required
                      placeholder="At least 6 characters"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="admin">Admin (Full Access)</option>
                      <option value="moderator">Moderator (Publishing Only)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-semibold rounded-xl transition-all cursor-pointer text-sm flex items-center justify-center space-x-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Create Admin Account</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
