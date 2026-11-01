import { useEffect, useState } from 'react';
import { Pill } from 'lucide-react';
import { api, apiError } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Prescriptions(){
  const {user}=useAuth(); const id=user?.id||user?._id; const [items,setItems]=useState([]); const [error,setError]=useState('');
  useEffect(()=>{if(id)api.get(`/prescriptions/patient/${id}`).then(r=>setItems(r.data)).catch(e=>setError(apiError(e)));},[id]);
  return <><div className="page-header"><div><span className="eyebrow">Digital care</span><h1>Prescriptions</h1><p>Prescriptions issued by doctors with active access to your vault.</p></div></div>{error&&<div className="alert error">{error}</div>}<div className="prescription-grid">{items.map(p=><article className="card prescription" key={p._id}><div className="section-title"><div><h2>{p.diagnosis||'Prescription'}</h2><p>{p.doctor?.name} · {new Date(p.createdAt).toLocaleDateString()}</p></div><Pill/></div>{p.medications.map((m,i)=><div className="medicine" key={i}><b>{m.name}</b><span>{[m.dosage,m.frequency,m.duration].filter(Boolean).join(' · ')}</span><small>{m.instructions}</small></div>)}{p.advice&&<div className="notice"><b>Advice:</b> {p.advice}</div>}{p.followUpDate&&<small>Follow-up: {new Date(p.followUpDate).toLocaleDateString()}</small>}</article>)}{!items.length&&<div className="card empty">No prescriptions yet.</div>}</div></>;
}
