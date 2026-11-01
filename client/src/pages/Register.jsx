import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../api';

export default function Register() {
  const { register } = useAuth(); const nav = useNavigate();
  const [form,setForm]=useState({name:'',email:'',password:'',role:'patient',licenseNumber:'',speciality:''}); const [error,setError]=useState('');
  async function submit(e){e.preventDefault();try{setError('');await register(form);nav('/');}catch(e){setError(apiError(e));}}
  return <div className="auth-page"><form className="auth-card standalone" onSubmit={submit}><h2>Create account</h2>{error&&<div className="alert error">{error}</div>}<label>Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Email<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Password<input required minLength="8" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="patient">Patient</option><option value="doctor">Doctor</option></select></label>{form.role==='doctor'&&<><label>Medical license number<input required value={form.licenseNumber} onChange={e=>setForm({...form,licenseNumber:e.target.value})}/></label><label>Speciality<input value={form.speciality} onChange={e=>setForm({...form,speciality:e.target.value})}/></label></>}<button className="primary">Create account</button><small>Already registered? <Link to="/login">Sign in</Link></small></form></div>;
}
