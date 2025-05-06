// App.js (Código Completo)
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Home from './components/Home/Home';
import Sobre from './components/Sobre/Sobre';
import Roteiros from './components/Roteiros/Roteiros';
import Cadastro from './components/Cadastro/Cadastro';
import Login from './components/Login/Login';
import Footer from './components/Footer/Footer';
import styles from './App.module.css';
import DashboardUsuario from './components/Usuario/DashboardUsuario';
import DashboardAdmin from './components/Admin/DashboardAdmin';
import FuncionarioDashboard from './components/Funcionario/FuncionarioDashboard';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner'; // <<< Importar

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

function App() {
    const [user, setUser] = useState(null);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [authError, setAuthError] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            console.log("App.js Auth State Changed:", currentUser?.email);
            setUser(currentUser);
            setIsCheckingAuth(false);
        }, (error) => {
            console.error("Erro no listener onAuthStateChanged:", error);
            setAuthError(error);
            setIsCheckingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    // --- SPINNER AQUI É NECESSÁRIO ---
    if (isCheckingAuth) {
         return (
             <div className={styles.appContainer}>
                <Header />
                <main className={styles.mainContent}>
                     <LoadingSpinner mensagem="Verificando autenticação..." /> {/* Mantém o spinner */}
                </main>
                <Footer />
            </div>
         );
    }
    // --- FIM SPINNER ---

    if (authError) {
        return <div className={styles.appContainer}><main className={styles.mainContent}>Erro ao verificar autenticação: {authError.message}</main></div>;
    }

    function ProtectedRoute({ children, roleRequired }) {
        if (!user) { return <Navigate to="/login" replace />; }
        const isUserAdmin = ADMIN_EMAIL && user.email === ADMIN_EMAIL;
        if (roleRequired === 'admin') { return isUserAdmin ? children : <Navigate to="/dashboard" replace />; }
        else if (roleRequired === 'user') { return !isUserAdmin ? children : <Navigate to="/admin-dashboard" replace />; }
        else if (roleRequired === 'funcionario') { return !isUserAdmin ? children : <Navigate to="/admin-dashboard" replace />; }
        return <Navigate to="/login" replace />;
    }

    const getDefaultRedirectPath = () => {
        if (!user) return "/login";
        if (!ADMIN_EMAIL) { console.error("REACT_APP_ADMIN_EMAIL não definido!"); return "/login"; }
        return user.email === ADMIN_EMAIL ? "/admin-dashboard" : "/dashboard";
    };

    return (
        <Router>
            <div className={styles.appContainer}>
                <Header />
                <main className={styles.mainContent}>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/sobre" element={<Sobre />} />
                        <Route path="/roteiros" element={<Roteiros />} />
                        <Route path="/cadastro" element={user ? <Navigate to={getDefaultRedirectPath()} replace /> : <Cadastro />} />
                        <Route path="/login" element={user ? <Navigate to={getDefaultRedirectPath()} replace /> : <Login />} />
                        <Route path="/dashboard" element={ <ProtectedRoute roleRequired="user"> <DashboardUsuario /> </ProtectedRoute> } />
                        <Route path="/admin-dashboard" element={ <ProtectedRoute roleRequired="admin"> <DashboardAdmin /> </ProtectedRoute> } />
                        <Route path="/funcionario-dashboard" element={ <ProtectedRoute roleRequired="funcionario"> <FuncionarioDashboard /> </ProtectedRoute> } />
                        <Route path="*" element={<Navigate to={getDefaultRedirectPath()} replace />} />
                    </Routes>
                </main>
                <Footer />
            </div>
        </Router>
    );
}

export default App;