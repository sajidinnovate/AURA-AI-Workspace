import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, Moon, Sun, ArrowRight, AlertCircle, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

export default function AuthPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme_mode') || 'dark');
  const isDark = theme === 'dark';
  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme_mode', next);
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Form state
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Enforce password strength when creating an account: minimum 8 characters, at least 1 letter and 1 number
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (isRegistering && !passwordRegex.test(password)) {
      setError('Password must be at least 8 characters long and include both letters and numbers.');
      return;
    }

    setLoading(true);
    try {
      const res = isRegistering
        ? await authAPI.register(name, email, password)
        : await authAPI.login(email, password);
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-between transition-colors duration-200 ${isDark ? 'bg-[#0B0F19] text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      {/* Top Navbar - Full Width like Dashboard */}
      <header className={`w-full px-6 md:px-10 py-4 flex items-center justify-between border-b ${isDark ? 'border-slate-800 bg-[#0D1322]/80' : 'border-slate-200 bg-white/80'} backdrop-blur-md`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
            <FileText className="w-5 h-5" />
          </div>
          <span className="text-base font-extrabold tracking-tight">
            AURA AI WORKSPACE
          </span>
        </div>

        <button
          onClick={toggleTheme}
          type="button"
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-2 transition-all ${isDark
            ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm'
            }`}
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </header>

      {/* Centered Clean Auth Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className={`w-full max-w-md p-8 sm:p-10 rounded-2xl border shadow-xl transition-all ${isDark
          ? 'bg-slate-900/90 border-slate-800 shadow-2xl'
          : 'bg-white border-slate-200 shadow-lg'
          }`}>
          {/* Card Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight">
              {isRegistering ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className={`text-sm mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {isRegistering
                ? 'Sign up to start organizing and chatting with your documents'
                : 'Enter your credentials to access your workspaces'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-sm flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Enter Your Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border outline-none transition-all ${isDark
                      ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                  />
                </div>
              </div>
            )}

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="email" K
                  required
                  placeholder="Enter Your Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border outline-none transition-all ${isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border outline-none transition-all ${isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isRegistering && (
                <p className={`mt-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Must be at least 8 characters long and include both letters and numbers.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegistering ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle between Register and Login */}
          <div className={`mt-6 pt-5 border-t ${isDark ? 'border-slate-800/60' : 'border-slate-200'} text-center text-sm`}>
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              {isRegistering ? 'Already have an account?' : "Don't have an account?"}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError('');
              }}
              className="ml-1.5 font-semibold text-indigo-500 hover:text-indigo-400 hover:underline transition-colors"
            >
              {isRegistering ? 'Sign In' : 'Register here'}
            </button>
          </div>
        </div>
      </main>

      {/* Simple Clean Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-5 text-center text-xs text-slate-500">
        © 2026 AURA AI Workspace • Multi-Document Intelligence
      </footer>
    </div>
  );
}