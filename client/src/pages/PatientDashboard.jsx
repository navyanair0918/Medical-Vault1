import { useEffect, useState } from 'react';
import { Check, Clock3, QrCode, ShieldCheck } from 'lucide-react';
import { api, apiError } from '../api';
import { useAuth } from '../context/AuthContext';
import MetricCard from '../components/MetricCard';

export default function PatientDashboard(){
  const {user}=useAuth(); const id=user?.id||user?._id;
  const [qr,setQr]=useState(null); const [grants,setGrants]=useState([]); const [appointments,setAppointments]=useState([]); const [trends,setTrends]=useState([]); const [error,setError]=useState('');
  async function load(){try{setError('');const [q,g,a,t]=await Promise.all([api.get('/qr/me'),api.get('/access/mine'),api.get('/appointments/mine'),api.get(`/health-reports/overview/${id}`)]);setQr(q.data);setGrants(g.data);setAppointments(a.data);setTrends(t.data.trends||[]);}catch(e){setError(apiError(e));}}
  useEffect(()=>{if(id)load();},[id]);
  async function updateGrant(grantId,status){await api.patch(`/access/${grantId}`,{status,hours:24});load();}
  const flagged=trends.filter(t=>t.latest?.status!=='within_range').length;
  const pending=grants.filter(g=>g.status==='pending');
  return <>
    <div className="page-header"><div><span className="eyebrow">Patient workspace</span><h1>Welcome, {user?.name}</h1><p>Your records and health trends stay under your control.</p></div><div className="trust-pill"><ShieldCheck size={17}/> Consent-controlled sharing</div></div>
    {error&&<div className="alert error">{error}</div>}
    <div className="metrics"><MetricCard label="Doctor access requests" value={pending.length} hint="Pending your approval"/><MetricCard label="Tracked health metrics" value={trends.length} hint={`${flagged} currently outside entered range`}/><MetricCard label="Appointments" value={appointments.length} hint="All scheduled history"/></div>
    <div className="grid two">
      <section className="card qr-card"><div className="section-title"><div><h2>Your medical QR</h2><p>Doctors scan this to request/open your vault.</p></div><QrCode/></div>{qr?<><img className="qr-image" src={qr.dataUrl} alt="Patient medical QR"/><code className="qr-code-text">{qr.publicQrId}</code><small>No health data is stored inside the QR itself.</small></>:<div className="skeleton">Generating QR…</div>}</section>
      <section className="card"><div className="section-title"><div><h2>Access control</h2><p>Approve or revoke doctor access.</p></div><ShieldCheck/></div>{grants.length===0?<div className="empty">No doctor access requests yet.</div>:<div className="list">{grants.map(g=><div className="list-row" key={g._id}><div><b>{g.doctor?.name||'Doctor'}</b><small>{g.doctor?.doctorProfile?.speciality||g.doctor?.email}</small><span className={`status ${g.status}`}>{g.status}</span></div><div className="row-actions">{g.status==='pending'&&<button className="primary small" onClick={()=>updateGrant(g._id,'active')}><Check size={15}/>Approve 24h</button>}{g.status==='active'&&<button className="ghost small" onClick={()=>updateGrant(g._id,'revoked')}>Revoke</button>}</div></div>)}</div>}</section>
    </div>
    <div className="grid two">
      <section className="card"><div className="section-title"><div><h2>Recent appointments</h2><p>Upcoming care schedule.</p></div><Clock3/></div>{appointments.slice(0,4).map(a=><div className="list-row" key={a._id}><div><b>{a.doctor?.name}</b><small>{new Date(a.startsAt).toLocaleString()} · {a.mode.replace('_',' ')}</small></div><span className={`status ${a.status}`}>{a.status}</span></div>)}{!appointments.length&&<div className="empty">No appointments yet.</div>}</section>
      <section className="card"><div className="section-title"><div><h2>Health metric watch</h2><p>Latest numeric values across your structured health reports.</p></div></div>{trends.slice(0,5).map(t=><div className="list-row" key={t.name}><div><b>{t.name}</b><small>{t.trend.direction} over {t.points.length} result(s)</small></div><div className="value-stack"><strong>{t.latest.value} {t.unit}</strong><span className={`status ${t.latest.status==='within_range'?'active':'pending'}`}>{t.latest.status.replace('_',' ')}</span></div></div>)}{!trends.length&&<div className="empty">Add structured health reports to start longitudinal analysis.</div>}</section>
    </div>
  </>;
}
