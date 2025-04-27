import React, { useState, useEffect } from 'react';
import { auth } from '../../services/firebase';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardAdmin.module.css';

import ListaCaravanasAdmin from './listas/ListaCaravana';
import ListaLocalidades from './listas/ListaLocalidades';
import ListaFuncionariosAdmin from './listas/ListaFuncionariosAdmin';
import ListaTransportesAdmin from './listas/ListaTransporte'; // 
import FormularioCaravana from './formularios/FormularioCaravana';
import FormularioLocalidade from './formularios/FormularioLocalidade';
import FormularioFuncionario from './formularios/FormularioFuncionario';
// import FormularioTransporte from './formularios/FormularioTransporte'; // Importe se precisar usar aqui

function DashboardAdmin() {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('caravanas');
    const [error, setError] = useState(null);

    const [modoEdicao, setModoEdicao] = useState({
        caravanas: false,
        localidades: false,
        funcionarios: false,
        transportes: false, // <<< ADICIONADO Chave
    });
    const [itemParaEditar, setItemParaEditar] = useState({
        caravanas: null,
        localidades: null,
        funcionarios: null,
        transportes: null, // <<< ADICIONADO Chave
    });

    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                if (currentUser.email !== 'adm@adm.com') {
                    console.warn("Usuário não autorizado acessando painel admin:", currentUser.email);
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
            setError(`Erro ao fazer logout: ${error.message}`);
        }
    };

    const handleCriar = (tipo) => {
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: true }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: null }));
        console.log(`Iniciando criação de ${tipo}`);
    };

    const handleEditar = (tipo, item) => {
        if (!item) {
            console.error(`Tentativa de editar item nulo do tipo ${tipo}`);
            return;
        }
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: true }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: item }));
        console.log(`Iniciando edição de ${tipo}:`, item);
    };

    const handleCancelar = (tipo) => {
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: false }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: null }));
        console.log(`Cancelada edição/criação de ${tipo}`);
    };

    const handleSalvar = (tipo) => {
        setModoEdicao((prevModo) => ({ ...prevModo, [tipo]: false }));
        setItemParaEditar((prevItem) => ({ ...prevItem, [tipo]: null }));
        console.log(`${tipo} salvo(a) com sucesso.`);
    };

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
                    className={`${styles.menuButton} ${activeTab === 'funcionarios' ? styles.active : ''}`}
                    onClick={() => setActiveTab('funcionarios')}
                >
                    Funcionários
                </button>
                <button
                    className={`${styles.menuButton} ${activeTab === 'localidades' ? styles.active : ''}`}
                    onClick={() => setActiveTab('localidades')}
                >
                    Localidades
                </button>
                {/* <<< ADICIONADO Botão Transportes >>> */}
                <button
                    className={`${styles.menuButton} ${activeTab === 'transportes' ? styles.active : ''}`}
                    onClick={() => setActiveTab('transportes')}
                >
                    Transportes
                </button>
                <button onClick={handleLogout} className={styles.logoutButton}>
                    Logout
                </button>
            </div>

            <div className={styles.mainContent}>
                {/* Bloco Caravanas (IDÊNTICO AO ORIGINAL) */}
                {activeTab === 'caravanas' && (
                    <>
                        {modoEdicao.caravanas ? (
                            <FormularioCaravana
                                caravana={itemParaEditar.caravanas}
                                onSalvar={() => handleSalvar('caravanas')}
                                onCancelar={() => handleCancelar('caravanas')}
                            />
                        ) : (
                            <>
                                {/* Botão Criar pode estar aqui ou na Lista */}
                                <ListaCaravanasAdmin
                                    onEditar={(item) => handleEditar('caravanas', item)}
                                />
                            </>
                        )}
                    </>
                )}

                {/* Bloco Funcionários (IDÊNTICO AO ORIGINAL) */}
                {activeTab === 'funcionarios' && (
                    <>
                        {modoEdicao.funcionarios ? (
                            <FormularioFuncionario
                                funcionario={itemParaEditar.funcionarios}
                                onSalvar={() => handleSalvar('funcionarios')}
                                onCancelar={() => handleCancelar('funcionarios')}
                            />
                        ) : (
                            <>
                                {/* Botão Criar pode estar aqui ou na Lista */}
                                <ListaFuncionariosAdmin
                                    onEditar={(item) => handleEditar('funcionarios', item)}
                                />
                            </>
                        )}
                    </>
                )}

                {/* Bloco Localidades (IDÊNTICO AO ORIGINAL) */}
                {activeTab === 'localidades' && (
                    <>
                        {modoEdicao.localidades ? (
                            <FormularioLocalidade
                                localidade={itemParaEditar.localidades}
                                onSalvar={() => handleSalvar('localidades')}
                                onCancelar={() => handleCancelar('localidades')}
                            />
                        ) : (
                            <>
                                {/* Botão Criar pode estar aqui ou na Lista */}
                                <ListaLocalidades
                                    onEditar={(item) => handleEditar('localidades', item)}
                                />
                            </>
                        )}
                    </>
                )}

                 {/* <<< ADICIONADO Bloco Transportes >>> */}
                 {activeTab === 'transportes' && (
                     <>
                        {/* Renderiza apenas a lista, pois ela gerencia seus próprios modais */}
                        <ListaTransportesAdmin />
                        {/* Se precisasse editar direto aqui, seria: */}
                        {/* modoEdicao.transportes ? <FormularioTransporte transporte={itemParaEditar.transportes} ... /> : <ListaTransportesAdmin ... /> */}
                     </>
                 )}
            </div>
        </div>
    );
}

export default DashboardAdmin;