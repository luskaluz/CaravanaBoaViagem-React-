import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/api';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../services/firebase';
import styles from './FuncionarioDashboard.module.css';
import ListaCaravanasFuncionario from './ListaCaravanasFuncionario';
import ModalDetalhesCaravanaFuncionario from './ModalDetalhesCaravanasFuncionario';
import ParticipantesModal from './ParticipantesModal'; // Assume que este é um modal que ENCAPSULA o componente Participantes
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner'; // Importe seu spinner

function FuncionarioDashboard() {
    const [caravanasFuncionario, setCaravanasFuncionario] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const [user, authLoading, authError] = useAuthState(auth);
    const [funcionarioLogado, setFuncionarioLogado] = useState(null); // Para guardar dados do funcionário
    const [activeSection, setActiveSection] = useState('todas');
    const [showParticipantesModal, setShowParticipantesModal] = useState(false);
    const [selectedCaravanaIdParaParticipantes, setSelectedCaravanaIdParaParticipantes] = useState(null);
    const navigate = useNavigate();

    // Busca dados do funcionário logado uma vez
    useEffect(() => {
        const fetchFuncionarioData = async () => {
            if (user && !funcionarioLogado) { // Só busca se tiver usuário e ainda não tiver os dados
                try {
                    const funcData = await api.getFuncionarioById(user.uid); // Usa a mesma API que o login
                    if (funcData) {
                        setFuncionarioLogado(funcData);
                    } else {
                        // Funcionário autenticado mas não encontrado no Firestore
                        console.warn("Funcionário autenticado mas não encontrado no DB:", user.uid);
                        setError("Seus dados de funcionário não foram encontrados. Contate o suporte.");
                        // Considerar deslogar ou redirecionar
                        // await signOut(auth);
                        // navigate('/login');
                    }
                } catch (err) {
                    console.error("Erro ao buscar dados do funcionário no dashboard:", err);
                    setError("Erro ao carregar seus dados de funcionário.");
                }
            }
        };
        if (!authLoading && user) {
            fetchFuncionarioData();
        }
    }, [user, authLoading, funcionarioLogado]); // Adiciona funcionarioLogado para evitar re-fetch

    // Busca caravanas quando o usuário (e seus dados de funcionário) estiverem disponíveis
    useEffect(() => {
        const fetchCaravanas = async () => {
            if (!authLoading && user && funcionarioLogado) { // Agora espera também por funcionarioLogado
                setLoading(true);
                setError(null);
                try {
                    const data = await api.getCaravanasFuncionario(user.uid);
                    setCaravanasFuncionario(data || []); // Garante array
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
            } else if (!authLoading && !user) {
                setCaravanasFuncionario([]); setLoading(false); navigate('/login');
            }
        };
        fetchCaravanas();
    }, [user, authLoading, navigate, funcionarioLogado]); // Adiciona funcionarioLogado como dependência

    const openModalDetalhes = (caravana) => { setModalDetalhes(caravana); };
    const closeModalDetalhes = () => { setModalDetalhes(null); };

    const openParticipantesModal = (caravanaId, funcUid, funcCargo) => {
        setSelectedCaravanaIdParaParticipantes(caravanaId);
        setShowParticipantesModal(true);
    };
    const closeParticipantesModal = () => { setShowParticipantesModal(false); setSelectedCaravanaIdParaParticipantes(null); };

    const handleSectionChange = (section) => { setActiveSection(section); };

    const handleLogout = async () => {
        try { await signOut(auth); navigate("/"); }
        catch (err) { console.error("Erro logout:", err); setError(err.message); }
    };

    if (authLoading || (user && !funcionarioLogado && !error) ) { // Mostra loading enquanto busca funcionário também
        return <div className={styles.loadingScreen}><LoadingSpinner mensagem="Carregando dados do funcionário..." /></div>;
    }
    if (authError) { return <div className={styles.container}><div className={styles.error}>Erro de autenticação: {authError.message}</div></div>; }
    if (!user && !authLoading) { return <div className={styles.container}><p>Redirecionando para login...</p></div>; }


    let listaFiltrada = [...caravanasFuncionario];
    if (activeSection === 'confirmadas') { listaFiltrada = caravanasFuncionario.filter(c => c.status === 'confirmada'); }
    else if (activeSection === 'naoConfirmadas') { listaFiltrada = caravanasFuncionario.filter(c => c.status === 'nao_confirmada'); }
    else if (activeSection === 'canceladas') { listaFiltrada = caravanasFuncionario.filter(c => c.status === 'cancelada'); }
    else if (activeSection === 'concluidas') { listaFiltrada = caravanasFuncionario.filter(c => c.status === 'concluida'); }


    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <h2>Painel do Funcionário</h2>
                <button className={`${styles.menuButton} ${activeSection === 'todas' ? styles.active : ''}`} onClick={() => handleSectionChange('todas')}> Todas as Caravanas </button>
                <button className={`${styles.menuButton} ${activeSection === 'confirmadas' ? styles.active : ''}`} onClick={() => handleSectionChange('confirmadas')}> Confirmadas </button>
                <button className={`${styles.menuButton} ${activeSection === 'naoConfirmadas' ? styles.active : ''}`} onClick={() => handleSectionChange('naoConfirmadas')}> Não Confirmadas </button>
                <button className={`${styles.menuButton} ${activeSection === 'canceladas' ? styles.active : ''}`} onClick={() => handleSectionChange('canceladas')}> Canceladas </button>
                <button className={`${styles.menuButton} ${activeSection === 'concluidas' ? styles.active : ''}`} onClick={() => handleSectionChange('concluidas')}> Concluídas </button>
                <button onClick={handleLogout} className={styles.logoutButton}> Logout </button>
            </div>
            <div className={styles.mainContent}>
                {loading && <LoadingSpinner mensagem="Carregando caravanas..." />}
                {error && <div className={styles.error}>Erro: {error}</div>}
                {!loading && !error && funcionarioLogado && listaFiltrada.length === 0 && (
                    <p className={styles.containerMensagem}>
                        {activeSection === 'todas' ? 'Nenhuma caravana associada a você no momento.' : `Nenhuma caravana ${activeSection.replace('naoConfirmadas', 'não confirmadas')} encontrada.`}
                    </p>
                )}
                {!loading && !error && funcionarioLogado && listaFiltrada.length > 0 && (
                    <ListaCaravanasFuncionario
                        caravanas={listaFiltrada}
                        onCaravanaClick={openModalDetalhes}
                        onParticipantesClick={openParticipantesModal} // Passa a função correta
                        funcionarioLogado={funcionarioLogado} // Passa dados do funcionário logado
                    />
                )}
                {!loading && !error && !funcionarioLogado && <p className={styles.error}>Não foi possível carregar seus dados de funcionário. Contate o suporte.</p>}


                {modalDetalhes && ( <ModalDetalhesCaravanaFuncionario caravana={modalDetalhes} onClose={closeModalDetalhes}/> )}
                {showParticipantesModal && funcionarioLogado && (
                    <ParticipantesModal
                        caravanaId={selectedCaravanaIdParaParticipantes}
                        funcionarioUid={funcionarioLogado.uid} // Passa o UID
                        cargo={funcionarioLogado.cargo} // Passa o cargo
                        onClose={closeParticipantesModal}
                    />
                )}
            </div>
        </div>
    );
}

export default FuncionarioDashboard;