import React, { useState, useEffect } from 'react';
import { auth } from '../../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardAdmin.module.css';

import ListaCaravanasAdmin from './listas/ListaCaravana';
import ListaLocalidades from './listas/ListaLocalidades';
import ListaFuncionariosAdmin from './listas/ListaFuncionariosAdmin';
import ListaTransportesAdmin from './listas/ListaTransporte';
import FormularioCaravana from './formularios/FormularioCaravana';
import FormularioLocalidade from './formularios/FormularioLocalidade';
import FormularioFuncionario from './formularios/FormularioFuncionario';

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

function DashboardAdmin() {
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [activeTab, setActiveTab] = useState('caravanas');
    const [error, setError] = useState(null);
    const [modoEdicao, setModoEdicao] = useState({
        caravanas: false, localidades: false, funcionarios: false, transportes: false,
    });
    const [itemParaEditar, setItemParaEditar] = useState({
        caravanas: null, localidades: null, funcionarios: null, transportes: null,
    });
    const navigate = useNavigate();

    useEffect(() => {
        console.log("DashboardAdmin montado. Verificando autorização...");
        if (!ADMIN_EMAIL) {
            console.error("REACT_APP_ADMIN_EMAIL não definido no DashboardAdmin!");
            setError("Erro crítico de configuração do administrador.");
            setIsLoadingAuth(false);
            setIsAuthorized(false);
            navigate('/login');
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                console.log("DashboardAdmin Auth State: Usuário encontrado", currentUser.email);
                if (currentUser.email === ADMIN_EMAIL) {
                    console.log("DashboardAdmin: Autorizado.");
                    setIsAuthorized(true);
                } else {
                    console.warn("DashboardAdmin: Usuário NÃO autorizado:", currentUser.email);
                    setIsAuthorized(false);
                    navigate('/login');
                }
            } else {
                console.log("DashboardAdmin Auth State: Nenhum usuário logado.");
                setIsAuthorized(false);
                navigate('/login');
            }
            setIsLoadingAuth(false);
        }, (error) => {
            console.error("Erro no listener de autenticação do DashboardAdmin:", error);
            setError("Erro ao verificar autenticação.");
            setIsLoadingAuth(false);
            setIsAuthorized(false);
            navigate('/login');
        });

        return () => {
            console.log("DashboardAdmin desmontando. Limpando listener.");
            unsubscribe();
        };
    }, [navigate]);

    const handleLogout = async () => {
        try {
            await auth.signOut();
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            setError(`Erro ao fazer logout: ${error.message}`);
        }
    };

    const handleCriar = (tipo) => { setModoEdicao(prev => ({ ...prev, [tipo]: true })); setItemParaEditar(prev => ({ ...prev, [tipo]: null })); };
    const handleEditar = (tipo, item) => { if (!item) return; setModoEdicao(prev => ({ ...prev, [tipo]: true })); setItemParaEditar(prev => ({ ...prev, [tipo]: item })); };
    const handleCancelar = (tipo) => { setModoEdicao(prev => ({ ...prev, [tipo]: false })); setItemParaEditar(prev => ({ ...prev, [tipo]: null })); };
    const handleSalvar = (tipo) => { setModoEdicao(prev => ({ ...prev, [tipo]: false })); setItemParaEditar(prev => ({ ...prev, [tipo]: null })); };

    if (error) return <div className={styles.container}><main className={styles.mainContent}><div className={styles.error}>Erro: {error}</div></main></div>;
    if (isLoadingAuth) return <div className={styles.container}><main className={styles.mainContent}><div className={styles.loading}>Verificando acesso...</div></main></div>;
    if (!isAuthorized) return null;

    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <h2>Painel Administrativo</h2>
                <button className={`${styles.menuButton} ${activeTab === 'caravanas' ? styles.active : ''}`} onClick={() => setActiveTab('caravanas')}> Caravanas </button>
                <button className={`${styles.menuButton} ${activeTab === 'funcionarios' ? styles.active : ''}`} onClick={() => setActiveTab('funcionarios')}> Funcionários </button>
                <button className={`${styles.menuButton} ${activeTab === 'localidades' ? styles.active : ''}`} onClick={() => setActiveTab('localidades')}> Localidades </button>
                <button className={`${styles.menuButton} ${activeTab === 'transportes' ? styles.active : ''}`} onClick={() => setActiveTab('transportes')}> Transportes </button>
                <button onClick={handleLogout} className={styles.logoutButton}> Logout </button>
            </div>

            <div className={styles.mainContent}>
                {activeTab === 'caravanas' && (
                    <>
                        {modoEdicao.caravanas ? (
                            <FormularioCaravana caravana={itemParaEditar.caravanas} onSalvar={() => handleSalvar('caravanas')} onCancelar={() => handleCancelar('caravanas')} />
                        ) : (
                            <ListaCaravanasAdmin onEditar={(item) => handleEditar('caravanas', item)} />
                        )}
                    </>
                )}

                {activeTab === 'funcionarios' && (
                     <>
                        {modoEdicao.funcionarios ? (
                            <FormularioFuncionario funcionario={itemParaEditar.funcionarios} onSalvar={() => handleSalvar('funcionarios')} onCancelar={() => handleCancelar('funcionarios')} />
                        ) : (
                            <ListaFuncionariosAdmin onEditar={(item) => handleEditar('funcionarios', item)} />
                        )}
                    </>
                )}

                {activeTab === 'localidades' && (
                    <>
                        {modoEdicao.localidades ? (
                            <FormularioLocalidade localidade={itemParaEditar.localidades} onSalvar={() => handleSalvar('localidades')} onCancelar={() => handleCancelar('localidades')} />
                        ) : (
                            <ListaLocalidades onEditar={(item) => handleEditar('localidades', item)} />
                        )}
                    </>
                )}

                 {activeTab === 'transportes' && (
                     <>
                        <ListaTransportesAdmin />
                     </>
                 )}
            </div>
        </div>
    );
}

export default DashboardAdmin;