import { BarChart3, CalendarClock, CalendarDays, FileHeart, HeartPulse, LogOut, QrCode, ShieldCheck, TestTube2, UserRound, UtensilsCrossed } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar(){
  const {user,logout}=useAuth(); const role=user?.role;
  const links=role==='patient'
    ? [['/',HeartPulse,'Dashboard'],['/records',FileHeart,'Records'],['/insights',BarChart3,'All Reports'],['/labs',TestTube2,'Labs'],['/wellness',UtensilsCrossed,'Wellness'],['/appointments',CalendarDays,'Appointments'],['/prescriptions',QrCode,'Prescriptions'],['/profile',UserRound,'Profile']]
    : role==='doctor'
      ? [['/',HeartPulse,'Doctor Home'],['/scan',QrCode,'Scan QR'],['/appointments',CalendarDays,'Appointments'],['/doctor-schedule',CalendarClock,'Availability']]
      : [['/',ShieldCheck,'Admin Center']];
  return <aside className="sidebar"><div className="brand"><div className="brand-mark">M+</div><div><b>MedVault</b><small>Health record platform</small></div></div><nav>{links.map(([to,Icon,label])=><NavLink key={to} to={to} end={to==='/'}><Icon size={18}/>{label}</NavLink>)}</nav><div className="sidebar-user"><div><b>{user?.name}</b><small>{user?.role}</small></div><button className="icon-btn" onClick={logout} title="Logout"><LogOut size={18}/></button></div></aside>;
}
