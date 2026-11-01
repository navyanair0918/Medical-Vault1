import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, Keyboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function extractId(text){try{const url=new URL(text);const parts=url.pathname.split('/').filter(Boolean);return parts.at(-1);}catch{return text.trim();}}
export default function Scan(){
 const nav=useNavigate(); const [manual,setManual]=useState(''); const [cameraError,setCameraError]=useState('');
 useEffect(()=>{let scanner;if(!window.isSecureContext){setCameraError('Camera scanning needs HTTPS on a phone. Open the patient QR with your phone camera, or use this scanner from localhost/HTTPS.');return;}try{scanner=new Html5QrcodeScanner('qr-reader',{fps:10,qrbox:{width:240,height:240}},false);scanner.render(text=>{const id=extractId(text);scanner.clear().catch(()=>{});nav(`/scan/${id}`);},()=>{});}catch(e){setCameraError(e.message);}return()=>scanner?.clear().catch(()=>{});},[]);
 function open(e){e.preventDefault();const id=extractId(manual);if(id)nav(`/scan/${id}`);}
 return <><div className="page-header"><div><span className="eyebrow">QR access</span><h1>Scan patient QR</h1><p>Camera scanning and a manual code fallback use the same secure authorization flow.</p></div></div><div className="grid two"><section className="card"><div className="section-title"><div><h2>Camera scanner</h2><p>Allow camera permission in your browser.</p></div><Camera/></div><div id="qr-reader" className="qr-reader"></div>{cameraError&&<div className="alert error">{cameraError}</div>}</section><form className="card form-card" onSubmit={open}><div className="section-title"><div><h2>Manual fallback</h2><p>Paste a QR URL or public QR ID.</p></div><Keyboard/></div><label>QR value<input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Paste scanned value"/></label><button className="primary">Open patient vault</button><div className="notice">A successful scan does not itself grant medical access. The API verifies consent before returning health information.</div></form></div></>;
}
