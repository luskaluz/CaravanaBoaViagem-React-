import React, { useState, useEffect } from 'react';
import { auth } from '../../services/firebase';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardAdmin.module.css';
import ListaCaravanasAdmin from './listas/ListaCaravana';
import ListaLocalidades from './listas/ListaLocalidades';
import FormularioCaravana from './formularios/FormularioCaravana';
import FormularioLocalidade from './formularios/FormularioLocalidade';
import ModalCriarLocalidade from './modal/ModalCriarLocalidade';

function DashboardAdmin() {
    const [user, setUser] = useState(null);
    const [showModalCriarLocalidade, setShowModalCriarLocalidade] = useState(false); 
    const [activeTab, setActiveTab] = useState('caravanas');

    const [error, setError] = useState(null);
    const [modoEdicao, setModoEdicao] = useState({
        caravanas: false,
        localidades: false,
    });
    const [itemParaEditar, setItemParaEditar] = useState({
        caravanas: null,
        localidades: null,
    });
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                if (currentUser.email !== 'adm@adm.com') {
                    navigate('/login');
                }
            } else {
                navigate('/login');
            }
        });

        return () => unsubscribe();
    }, [navigate]);


    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/');
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            setError(error.message);
        }
    };

    const handleCriar = (tipo) => {
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: true }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: null }));
    };

    const handleEditar = (tipo, item) => {
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: true }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: item }));
    };

    const handleCancelar = (tipo) => {
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: false }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: null }));
    };

    const handleSalvar = (tipo, salvarFn) => {
        salvarFn();
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: false }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: null }));
    };
   
    const openModalCriarLocalidade = () => { 
        setShowModalCriarLocalidade(true);
    };

    const closeModalCriarLocalidade = () => {
        setShowModalCriarLocalidade(false);
    };

    const handleLocalidadeSalva = () => { 

    }

    if (error) {
        return <div className={styles.error}>Erro: {error}</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <h2>Painel Administrativo</h2>
                <button
                    className={`${styles.menuButton} ${activeTab === 'caravanas' ? styles.active : ''}`}
                    onClick={() => setActiveTab('caravanas')}
                >
                    Caravanas
                </button>
                <button
                    className={`${styles.menuButton} ${activeTab === 'localidades' ? styles.active : ''}`}
                    onClick={() => setActiveTab('localidades')}
                >
                    Localidades
                </button>
                <button onClick={handleLogout} className={styles.logoutButton}>
                    Logout
                </button>
            </div>

            <div className={styles.mainContent}>
                {activeTab === 'caravanas' && (
                    <>
                        {modoEdicao.caravanas ? (
                            <FormularioCaravana
                                caravana={itemParaEditar.caravanas}
                                onSalvar={() => handleSalvar('caravanas', () => {})}
                                onCancelar={() => handleCancelar('caravanas')}
                            />
                        ) : (
                            <>

                                <ListaCaravanasAdmin onEditar={(item) => handleEditar('caravanas', item)} />
                            </>
                        )}
                    </>
                )}

                    {activeTab === 'localidades' && (
                    <>
                        <ListaLocalidades 
                            openModalCriarLocalidade={openModalCriarLocalidade}
                        />

                        {showModalCriarLocalidade && (
                            <ModalCriarLocalidade
                                onClose={closeModalCriarLocalidade}
                                onLocalidadeSalva={handleLocalidadeSalva}

                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default DashboardAdmin;
