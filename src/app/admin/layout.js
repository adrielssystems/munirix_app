import { getServerSession } from "next-auth/next";
import { adminAuthOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import styles from "./admin.module.css";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Settings, 
  Building2, 
  Bell, 
  Search 
} from "lucide-react";
import LogoutButton from "@/components/ui/LogoutButton";
import Link from "next/link";

export const metadata = {
  title: "Admin Panel | Munirix Admin",
  description: "Superadmin management dashboard",
};

export default async function AdminLayout({ children }) {
  const session = await getServerSession(adminAuthOptions);

  if (!session || session.user.role !== "superadmin") {
    redirect("/login");
  }

  return (
    <div className={styles.adminLayout}>
      {/* Sidebar Navigation */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h2>
            <img
              src="/brand/Logo_Munirix_sin_fondo.png"
              alt="Munirix"
              width={46}
              height={52}
              style={{ width: 'auto', height: 50, objectFit: 'contain' }}
            />
            <span>Munirix Admin</span>
          </h2>
          <span className={styles.superBadge}>Partner Admin</span>
        </div>
        
        <nav className={styles.nav}>
          <div className={styles.navSection}>Principal</div>
          <Link href="/admin" className={styles.navItem}>
            <LayoutDashboard size={20} className={styles.navIcon} />
            <span>Overview</span>
          </Link>
          
          <div className={styles.navSection}>Gestión</div>
          <Link href="/admin/clients" className={styles.navItem}>
            <Users size={20} className={styles.navIcon} />
            <span>Clientes (Tenants)</span>
          </Link>
          <Link href="/admin/payments" className={styles.navItem}>
            <CreditCard size={20} className={styles.navIcon} />
            <span>Pagos y Facturación</span>
          </Link>
          
          <div className={styles.navSection}>Sistema</div>
          <Link href="/admin/settings" className={styles.navItem}>
            <Settings size={20} className={styles.navIcon} />
            <span>Configuración</span>
          </Link>
        </nav>

        <div className={styles.userProfile}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{session.user.name || session.user.email}</span>
            <span className={styles.userRole}>{session.user.role}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        {/* Top Header */}
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            {/* The page title will be rendered by the active page, but we can have a search bar here */}
          </div>
          <div className={styles.headerActions}>
            <button className={styles.actionButton} title="Buscar en todo el sistema">
              <Search size={18} />
            </button>
            <button className={styles.actionButton} title="Notificaciones del sistema">
              <Bell size={18} />
            </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className={styles.contentWrapper}>
          {children}
        </div>
      </main>
    </div>
  );
}


