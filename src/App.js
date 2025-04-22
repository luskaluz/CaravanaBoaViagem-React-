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
import DetalhesCaravanaAdmin from './components/Admin/DetalhesCaravanaAdmin'; // Mantido se usado
import FuncionarioDashboard from './components/Funcionario/FuncionarioDashboard'; // <<< IMPORTAR O DASHBOARD DO FUNCIONÁRIO
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import FormularioCaravana from './components/Admin/formularios/FormularioCaravana'; // Mantido se usado para edição admin

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(null); // Corrigido state inicial

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            console.log("Auth State Changed:", currentUser?.email); // Log para depuração
            setUser(currentUser);
            setLoading(false);
            // Removido setAuthError daqui, deve vir de um catch, se necessário
        }, (error) => { // Adiciona tratamento de erro do listener
            console.error("Erro no onAuthStateChanged:", error);
            setAuthError(error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []); // Array de dependências vazio, executa só uma vez

    // Enquanto carrega o estado de autenticação, mostra um loader
    if (loading) {
        // Você pode retornar um componente de loading mais elaborado aqui
        return <div className={styles.loadingScreen}>Carregando...</div>;
    }

    // Se houve erro na autenticação inicial
    if (authError) {
        return <div>Erro de autenticação: {authError.message}</div>;
    }

    return (
        <Router>
            <div className={styles.appContainer}>
                <Header />
                <main className={styles.mainContent}> {/* Aplicando classe CSS */}
                    <Routes>

                        {/* Rotas Públicas */}
                        <Route path="/" element={<Home />} />
                        <Route path="/sobre" element={<Sobre />} />
                        <Route path="/roteiros" element={<Roteiros />} />

                        {/* Rotas de Autenticação (redireciona se já logado) */}
                        <Route path="/cadastro" element={!user ? <Cadastro /> : <Navigate to={user.email === "adm@adm.com" ? "/admin-dashboard" : "/dashboard"} />} />
                        <Route path="/login" element={!user ? <Login /> : <Navigate to={user.email === "adm@adm.com" ? "/admin-dashboard" : "/dashboard"} />} />

                        {/* --- Rotas Protegidas --- */}

                        {/* Dashboard do Usuário Normal */}
                        <Route path="/dashboard" element={user && user.email !== "adm@adm.com" ? <DashboardUsuario /> : <Navigate to="/login" />} />

                        {/* Dashboard do Administrador */}
                        <Route path="/admin-dashboard" element={user && user.email === "adm@adm.com" ? <DashboardAdmin /> : <Navigate to="/login" />} />
                        {/* Sub-rotas Admin (Exemplo) */}
                        <Route path="/admin/detalhes-caravana/:id" element={user && user.email === "adm@adm.com" ? <DetalhesCaravanaAdmin /> : <Navigate to="/login" />} />
                        <Route path="/admin/editar-caravana/:id" element={user && user.email === "adm@adm.com" ? <FormularioCaravana /> : <Navigate to="/login" />} />

                        {/* --- NOVA ROTA PARA FUNCIONÁRIO --- */}
                        <Route
                            path="/funcionario-dashboard"
                            element={
                                user && user.email !== "adm@adm.com"
                                ? <FuncionarioDashboard />
                                : <Navigate to="/login" />
                            }
                        />

                        {/* Rota Catch-all (Redireciona para home se logado, senão para login) */}
                        <Route path="*" element={<Navigate to={user ? (user.email === "adm@adm.com" ? "/admin-dashboard" : "/dashboard") : "/login"} />} />

                    </Routes>
                </main>
                <Footer />
            </div>
        </Router>
    );
}

export default App;