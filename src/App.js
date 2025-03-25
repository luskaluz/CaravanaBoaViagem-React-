// src/App.js
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
import DetalhesCaravanaAdmin from './components/Admin/DetalhesCaravanaAdmin';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import FormularioCaravana from './components/Admin/formularios/FormularioCaravana';

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
            if (authError) {
                setAuthError(authError);
            }
        });

        return () => unsubscribe();
    }, []);


    if (loading) {
        return <div>Carregando...</div>;
    }

    if (authError) {
        return <div>Erro de autenticação: {authError.message}</div>;
    }

    return (
        <Router>
            <div className={styles.appContainer}>
                <Header />
                <main style={styles.mainContent}>
                    <Routes>

                        <Route path="/" element={<Home />} />
                        <Route path="/sobre" element={<Sobre />} />
                        <Route path="/roteiros" element={<Roteiros />} />
                        <Route path="/cadastro" element={<Cadastro />} />
                        <Route path="/login" element={<Login />} />

                        {/* Rotas Protegidas - Forma Simplificada (sem ProtectedRoute separado) */}
                        <Route path="/dashboard" element={user ? <DashboardUsuario /> : <Navigate to="/login" />} />
                        <Route path="/admin-dashboard" element={user && user.email === "adm@adm.com" ? <DashboardAdmin /> : <Navigate to="/login" />} />
                        <Route path="/admin/detalhes-caravana/:id" element={user && user.email === "adm@adm.com" ? <DetalhesCaravanaAdmin /> : <Navigate to="/login" />} />
                        <Route path="/admin/editar-caravana/:id" element={user && user.email === "adm@adm.com" ? <FormularioCaravana /> : <Navigate to="/login" />} />

                        <Route path="*" element={<Navigate to="/login" />} />

                    </Routes>
                </main>
                <Footer />
            </div>
        </Router >
    );
}

export default App;

