import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import Register from './pages/Register';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Records from './pages/Records';
import Labs from './pages/Labs';
import HealthInsights from './pages/HealthInsights';
import Wellness from './pages/Wellness';
import Appointments from './pages/Appointments';
import Prescriptions from './pages/Prescriptions';
import Profile from './pages/Profile';
import Scan from './pages/Scan';
import QRPatient from './pages/QRPatient';
import DoctorSchedule from './pages/DoctorSchedule';

function Home(){const {user}=useAuth();if(user?.role==='admin')return <AdminDashboard/>;if(user?.role==='doctor')return <DoctorDashboard/>;return <PatientDashboard/>;}
const protectedPage=(element,roles)=><ProtectedRoute roles={roles}><AppShell>{element}</AppShell></ProtectedRoute>;
export default function App(){return <Routes>
  <Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/>
  <Route path="/" element={protectedPage(<Home/>)}/>
  <Route path="/records" element={protectedPage(<Records/>,['patient'])}/>
  <Route path="/labs" element={protectedPage(<Labs/>,['patient'])}/>
  <Route path="/insights" element={protectedPage(<HealthInsights/>,['patient'])}/>
  <Route path="/wellness" element={protectedPage(<Wellness/>,['patient'])}/>
  <Route path="/appointments" element={protectedPage(<Appointments/>,['patient','doctor'])}/>
  <Route path="/doctor-schedule" element={protectedPage(<DoctorSchedule/>,['doctor'])}/>
  <Route path="/prescriptions" element={protectedPage(<Prescriptions/>,['patient'])}/>
  <Route path="/profile" element={protectedPage(<Profile/>,['patient'])}/>
  <Route path="/scan" element={protectedPage(<Scan/>,['doctor'])}/>
  <Route path="/scan/:publicQrId" element={protectedPage(<QRPatient/>,['doctor'])}/>
  <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes>;}
