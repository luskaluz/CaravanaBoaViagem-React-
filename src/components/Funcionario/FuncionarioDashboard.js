import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../services/firebase';
import styles from './FuncionarioDashboard.module.css'; // <<< Importa o CSS (que vamos ajustar)
import ListaCaravanasFuncionario from './ListaCaravanasFuncionario';
import ModalDetalhesCaravanaFuncionario from './ModalDetalhesCaravanasFuncionario';
import ParticipantesModal from './ParticipantesModal';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

function FuncionarioDashboard() {
    const [caravanasFuncionario, setCaravanasFuncionario] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const [user, authLoading, authError] = useAuthState(auth);
    // const [funcionarioId, setFuncionarioId] = useState(null); // Removido
    const [activeSection, setActiveSection] = useState('todas'); // Mantido para filtro
    const [showParticipantesModal, setShowParticipantesModal] = useState(false);
    const [selectedCaravanaId, setSelectedCaravanaId] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchCaravanas = async () => {
            if (!authLoading && user) {
                setLoading(true);
                setError(null);
                try {
                    const data = await api.getCaravanasFuncionario(user.uid);
                    setCaravanasFuncionario(data);
                } catch (err) {
                    console.error("Erro ao buscar caravanas do funcionário:", err);
                     if (!err.message.includes('403')) { setError(err.message || "Erro ao carregar caravanas."); }
                     else { setError("Acesso negado para buscar caravanas."); }
                } finally { setLoading(false); }
            } else if (!authLoading && !user) {
                setCaravanasFuncionario([]); setLoading(false); navigate('/login');
            }
        };
        fetchCaravanas();
    }, [user, authLoading, navigate]);

    const openModalDetalhes = (caravana) => { setModalDetalhes(caravana); };
    const closeModalDetalhes = () => { setModalDetalhes(null); };
    const openParticipantesModal = (caravanaId) => { setSelectedCaravanaId(caravanaId); setShowParticipantesModal(true); };
    const closeParticipantesModal = () => { setShowParticipantesModal(false); setSelectedCaravanaId(null); };
    const handleSectionChange = (section) => { setActiveSection(section); };

    const handleLogout = async () => {
        try { await signOut(auth); navigate("/"); }
        catch (err) { console.error("Erro logout:", err); setError(err.message); }
    };

    if (authLoading) { return <div className={styles.loadingScreen}>Carregando autenticação...</div>; } // Melhor feedback de loading
    if (authError) { return <div className={styles.error}>Erro de autenticação: {authError.message}</div>; }
    if (!user) { return <div className={styles.container}><p>Redirecionando para login...</p></div>; } // Ou <Navigate to="/login"/> direto

    // Filtragem local (mantida)
    let listaFiltrada = caravanasFuncionario;
    if (activeSection === 'confirmadas') { listaFiltrada = caravanasFuncionario.filter(c => c.status === 'confirmada'); }
    else if (activeSection === 'naoConfirmadas') { listaFiltrada = caravanasFuncionario.filter(c => c.status === 'nao_confirmada'); }
    else if (activeSection === 'canceladas') { listaFiltrada = caravanasFuncionario.filter(c => c.status === 'cancelada'); }

    return (
        // Usa a classe container principal
        <div className={styles.container}>
            {/* Sidebar com a mesma estrutura do Admin */}
            <div className={styles.sidebar}>
                 {/* <<< TÍTULO ADICIONADO >>> */}
                <h2>Painel do Funcionário</h2>
                <button className={`${styles.menuButton} ${activeSection === 'todas' ? styles.active : ''}`} onClick={() => handleSectionChange('todas')}> Todas as Caravanas </button>
                <button className={`${styles.menuButton} ${activeSection === 'confirmadas' ? styles.active : ''}`} onClick={() => handleSectionChange('confirmadas')}> Confirmadas </button>
                <button className={`${styles.menuButton} ${activeSection === 'naoConfirmadas' ? styles.active : ''}`} onClick={() => handleSectionChange('naoConfirmadas')}> Não Confirmadas </button>
                <button className={`${styles.menuButton} ${activeSection === 'canceladas' ? styles.active : ''}`} onClick={() => handleSectionChange('canceladas')}> Canceladas </button>
                <button onClick={handleLogout} className={styles.logoutButton}> Logout </button>
            </div>
            {/* Conteúdo Principal */}
            <div className={styles.mainContent}>
                {loading && <div className={styles.loading}>Carregando caravanas...</div>}
                {error && <div className={styles.error}>Erro: {error}</div>}
                {!loading && !error && listaFiltrada.length === 0 && (
                    <p className={styles.containerMensagem}>
                        {activeSection === 'todas' ? 'Nenhuma caravana associada.' : `Nenhuma caravana ${activeSection.replace('naoConfirmadas', 'não confirmadas')}.`}
                    </p>
                )}
                {!loading && !error && listaFiltrada.length > 0 && (
                    <ListaCaravanasFuncionario
                        caravanas={listaFiltrada}
                        onCaravanaClick={openModalDetalhes}
                        onParticipantesClick={openParticipantesModal}
                    />
                )}

                {/* Modais */}
                {modalDetalhes && ( <ModalDetalhesCaravanaFuncionario caravana={modalDetalhes} onClose={closeModalDetalhes}/> )}
                {showParticipantesModal && ( <ParticipantesModal caravanaId={selectedCaravanaId} onClose={closeParticipantesModal}/> )}
            </div>
        </div>
    );
}

export default FuncionarioDashboard;