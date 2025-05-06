// src/components/Funcionario/DashboardFuncionario.js
import React, { useState, useEffect } from 'react';
import { auth } from '../../services/firebase';
import * as api from '../../services/api';
import { useAuthState } from 'react-firebase-hooks/auth';
// ESTILOS: Usaremos os do DashboardAdmin como base para o modal, mas você pode criar um específico
import styles from '../Admin/DashboardAdmin.module.css'; // << PODE USAR ESTILOS DE MODAL DO ADMIN
import ListaCaravanasFuncionario from './ListaCaravanasFuncionario';
import ModalDetalhesCaravanaFuncionario from './ModalDetalhesCaravanasFuncionario';
import Participantes from '../Admin/modal/Participantes'; // <<< USA O COMPONENTE DO ADMIN
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';

function FuncionarioDashboard() {
    const [caravanasAtribuidas, setCaravanasAtribuidas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const [user, authLoading, authError] = useAuthState(auth);
    const [funcionarioLogado, setFuncionarioLogado] = useState(null);
    const [activeSection, setActiveSection] = useState('todas');
    const [showParticipantesModal, setShowParticipantesModal] = useState(false); // Controla visibilidade
    const [selectedCaravanaIdParaParticipantes, setSelectedCaravanaIdParaParticipantes] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchFuncionarioData = async () => {
            if (user && !funcionarioLogado && !authLoading) {
                try {
                    const funcData = await api.getFuncionarioById(user.uid);
                    if (funcData) {
                        setFuncionarioLogado(funcData);
                    } else {
                        console.warn("Funcionário autenticado mas não encontrado no DB:", user.uid);
                        setError("Seus dados de funcionário não foram encontrados.");
                        await signOut(auth);
                    }
                } catch (err) {
                    console.error("Erro ao buscar dados do funcionário:", err);
                    setError("Erro ao carregar seus dados de funcionário.");
                     if (err.status === 404 || err.message.toLowerCase().includes("não encontrado")) {
                         await signOut(auth);
                     }
                }
            } else if (!user && !authLoading) {
                navigate('/login');
            }
        };
        fetchFuncionarioData();
    }, [user, authLoading, funcionarioLogado, navigate]);

    useEffect(() => {
        const fetchCaravanas = async () => {
            if (user && funcionarioLogado) {
                setLoading(true);
                setError(null);
                try {
                    const data = await api.getCaravanasFuncionario(user.uid);
                    setCaravanasAtribuidas(data || []);
                } catch (err) {
                    console.error("Erro ao buscar caravanas do funcionário:", err);
                     if (err.message && !err.message.toLowerCase().includes('network error') && err.status !== 403) {
                        setError(err.message || "Erro ao carregar suas caravanas.");
                     } else if (err.status === 403) {
                        setError("Acesso negado para buscar caravanas.");
                     } else {
                        setError("Erro de rede ou servidor indisponível ao buscar caravanas.");
                     }
                } finally { setLoading(false); }
            } else if (!user && !authLoading) {
                setCaravanasAtribuidas([]);
                setLoading(false);
            }
        };
        if (!authLoading) {
            fetchCaravanas();
        }
    }, [user, authLoading, funcionarioLogado]);


    const openModalDetalhes = (caravana) => { setModalDetalhes(caravana); };
    const closeModalDetalhes = () => { setModalDetalhes(null); };

    const handleAbrirModalParticipantes = (caravanaId) => {
        setSelectedCaravanaIdParaParticipantes(caravanaId);
        setShowParticipantesModal(true);
    };
    const handleCloseModalParticipantes = () => {
        setShowParticipantesModal(false);
        setSelectedCaravanaIdParaParticipantes(null);
    };

    const handleSectionChange = (section) => { setActiveSection(section); };

    const handleLogout = async () => {
        try { await signOut(auth); navigate("/"); }
        catch (err) { console.error("Erro logout:", err); setError(err.message); }
    };

    if (authLoading || (user && !funcionarioLogado && !error)) {
        return <div className={styles.loadingScreen}><LoadingSpinner mensagem="Carregando dados do funcionário..." /></div>;
    }
    if (authError) { return <div className={styles.container}><div className={styles.error}>Erro de autenticação: {authError.message}</div></div>; }
    if (!user && !authLoading) { return null; }
    if (error && !funcionarioLogado) {
        return <div className={styles.container}><div className={styles.error}>Erro ao carregar dados do funcionário: {error}. <button onClick={handleLogout}>Sair</button></div></div>;
    }

    let listaFiltrada = [...caravanasAtribuidas];
    if (activeSection === 'confirmadas') { listaFiltrada = caravanasAtribuidas.filter(c => c.status === 'confirmada'); }
    else if (activeSection === 'naoConfirmadas') { listaFiltrada = caravanasAtribuidas.filter(c => c.status === 'nao_confirmada'); }
    else if (activeSection === 'canceladas') { listaFiltrada = caravanasAtribuidas.filter(c => c.status === 'cancelada'); }
    else if (activeSection === 'concluidas') { listaFiltrada = caravanasAtribuidas.filter(c => c.status === 'concluida'); }


    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <h2>Painel do Funcionário</h2>
                <button className={`${styles.menuButton} ${activeSection === 'todas' ? styles.active : ''}`} onClick={() => handleSectionChange('todas')}> Todas Atribuídas </button>
                <button className={`${styles.menuButton} ${activeSection === 'confirmadas' ? styles.active : ''}`} onClick={() => handleSectionChange('confirmadas')}> Confirmadas </button>
                <button className={`${styles.menuButton} ${activeSection === 'naoConfirmadas' ? styles.active : ''}`} onClick={() => handleSectionChange('naoConfirmadas')}> Não Confirmadas </button>
                <button className={`${styles.menuButton} ${activeSection === 'canceladas' ? styles.active : ''}`} onClick={() => handleSectionChange('canceladas')}> Canceladas </button>
                <button className={`${styles.menuButton} ${activeSection === 'concluidas' ? styles.active : ''}`} onClick={() => handleSectionChange('concluidas')}> Concluídas </button>
                <button onClick={handleLogout} className={styles.logoutButton}> Logout </button>
            </div>
            <div className={styles.mainContent}>
                {loading && caravanasAtribuidas.length === 0 && <LoadingSpinner mensagem="Carregando suas caravanas..." />}
                {error && !loading && <div className={styles.error}>Erro: {error}</div>}
                {!loading && !error && funcionarioLogado && listaFiltrada.length === 0 && (
                    <p className={styles.containerMensagem}>
                        {activeSection === 'todas' ? 'Nenhuma caravana associada a você no momento.' : `Nenhuma caravana ${activeSection.replace('naoConfirmadas', 'não confirmadas')} encontrada.`}
                    </p>
                )}
                {!loading && !error && funcionarioLogado && listaFiltrada.length > 0 && (
                    <ListaCaravanasFuncionario
                        caravanas={listaFiltrada}
                        onCaravanaClick={openModalDetalhes}
                        onParticipantesClick={handleAbrirModalParticipantes}
                        funcionarioLogado={funcionarioLogado}
                    />
                )}
                {!loading && !error && !funcionarioLogado && user && <p className={styles.error}>Seus dados de funcionário não puderam ser carregados. Por favor, contate o suporte.</p>}


                {modalDetalhes && ( <ModalDetalhesCaravanaFuncionario caravana={modalDetalhes} onClose={closeModalDetalhes}/> )}

                {/* Renderiza o Modal de Participantes */}
                {showParticipantesModal && selectedCaravanaIdParaParticipantes && (
                    <div className={styles.modalOverlay} onClick={handleCloseModalParticipantes}> {/* Usa estilo do Admin para o overlay */}
                        <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}> {/* Usa estilo do Admin para o modal */}
                            <button className={styles.closeButton} onClick={handleCloseModalParticipantes}>×</button>
                            <Participantes
                                caravanaId={selectedCaravanaIdParaParticipantes}
                                // NÃO passa funcionarioUid nem cargo para obter a visão completa
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default FuncionarioDashboard;