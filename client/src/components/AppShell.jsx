import Navbar from './Navbar';
export default function AppShell({ children }) { return <div className="app-shell"><Navbar/><main className="page">{children}</main></div>; }
