// src/components/Usuario/DashboardUsuario.js

import React, { useState, useEffect } from 'react';
import { auth } from '../../services/firebase';
import * as api from '../../services/api';
import { useNavigate } from 'react-router-dom';
import ListaCaravanasUsuario from './ListaCaravanaUsuario';
import ModalDetalhesCaravanaUsuario from './ModalDetalhesCaravanaUsuario';
import styles from './DashboardUsuario.module.css';

function DashboardUsuario() {
    const [user, setUser] = useState(null);
    const [caravanas, setCaravanas] = useState([]); // Todas as caravanas, sem filtro
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeSection, setActiveSection] = useState('confirmadas');
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const navigate = useNavigate();



useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
        if (currentUser) {
            setUser(currentUser);
            try {
                // Chama a rota *sem* o status.  Vamos buscar *TODAS* as caravanas do usuário.
                const todasAsCaravanas = await api.getCaravanasUsuario(currentUser.uid);
                setCaravanas(todasAsCaravanas); // Salva *todas* as caravanas no estado.

            } catch (err) {
                setError(err);
                console.error("Erro ao carregar dados do usuário (onAuthStateChanged):", err);

            } finally {
                setLoading(false);
            }
        } else { // Limpa o estado se nao tiver usuário.
            setUser(null);
            setCaravanas([]);
            setLoading(false);
           //  navigate('/login');
        }
    });

    return () => unsubscribe();
}, [navigate]);



    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/');  // Redireciona para a página inicial após o logout
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            setError(error.message);
        }
    };

    const openModalDetalhes = (caravana) => { setModalDetalhes(caravana); };
    const closeModalDetalhes = () => { setModalDetalhes(null); };
    const handleSectionChange = (section) => { setActiveSection(section); };



    // Função de filtro (no frontend).  Esta é a chave.
    const filterCaravanas = (status) => {
        return caravanas.filter(caravana => caravana.status === status);
    }

    if (error) {
        return (
            <div>
                <h2>Erro:</h2>
                <p>{error.message}</p>

            </div>
        );
    }


    let content;

    if (activeSection === 'confirmadas') {
        const caravanasConfirmadas = filterCaravanas('confirmada'); // Filtra aqui
        content = caravanasConfirmadas.length === 0 ? (
            <p>Você não está registrado em nenhuma caravana confirmada.</p>
        ) : (
            <ListaCaravanasUsuario caravanas={caravanasConfirmadas} />
        );
    } else if (activeSection === 'naoConfirmadas') {
        const caravanasNaoConfirmadas = filterCaravanas('nao_confirmada'); // Filtra aqui
        content = caravanasNaoConfirmadas.length === 0 ? (
            <p>Você não está registrado em nenhuma caravana não confirmada.</p>
        ) : (
             <ListaCaravanasUsuario caravanas={caravanasNaoConfirmadas} />
        );
    } else if (activeSection === 'canceladas') {
        const caravanasCanceladas = filterCaravanas('cancelada'); // Filtra aqui
        content = caravanasCanceladas.length === 0 ? (
            <p>Você não participou de nenhuma caravana cancelada.</p>
        ) : (
            <ListaCaravanasUsuario caravanas={caravanasCanceladas} />
        );
    }


    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>

                <button
                    className={`${styles.menuButton} ${activeSection === 'confirmadas' ? styles.active : ''}`}
                    onClick={() => handleSectionChange('confirmadas')}
                >
                    Caravanas Confirmadas
                </button>
                <button
                    className={`${styles.menuButton} ${activeSection === 'naoConfirmadas' ? styles.active : ''}`}
                    onClick={() => handleSectionChange('naoConfirmadas')}
                >
                    Caravanas Não Confirmadas
                </button>
                <button
                    className={`${styles.menuButton} ${activeSection === 'canceladas' ? styles.active : ''}`}
                    onClick={() => handleSectionChange('canceladas')}
                >
                    Caravanas Canceladas
                </button>

                <button onClick={handleLogout} className={styles.logoutButton}>Logout</button>
            </div>
            <div className={styles.mainContent}>
                {content} {/* Renderiza o conteúdo filtrado (ListaCaravanasUsuario ou mensagem) */}
                {modalDetalhes && (
                    <ModalDetalhesCaravanaUsuario caravana={modalDetalhes} onClose={closeModalDetalhes} />
                )}
            </div>
        </div>
    );

}
export default DashboardUsuario;
