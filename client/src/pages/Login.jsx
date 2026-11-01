import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../api';

export default function Login() {
  const { login } = useAuth(); const nav = useNavigate(); const location = useLocation();
  const [form, setForm] = useState({ email: 'patient@demo.com', password: 'Demo@123' }); const [error, setError] = useState('');
  async function submit(e) { e.preventDefault(); try { setError(''); await login(form.email, form.password); nav(location.state?.from || '/'); } catch (e) { setError(apiError(e)); } }
  return <div className="auth-page"><div className="auth-panel"><div className="auth-hero"><ShieldCheck size={44}/><h1>Your health history, one secure vault.</h1><p>Records, prescriptions, multi-provider appointments, wellness and cross-report health trends with consent-based doctor access.</p><div className="demo-box"><b>Demo accounts</b><span>Patient: patient@demo.com</span><span>Doctor: doctor@demo.com</span><span>Admin: admin@demo.com</span><span>Password: Demo@123</span></div></div><form className="auth-card" onSubmit={submit}><h2>Sign in</h2><p>Continue to your MedVault workspace.</p>{error && <div className="alert error">{error}</div>}<label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Password<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><button className="primary">Sign in</button><small>New here? <Link to="/register">Create an account</Link></small></form></div></div>;
}
