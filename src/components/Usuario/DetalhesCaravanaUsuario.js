import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaUsuario.module.css';
import * as api from '../../services/api';
import translateStatus from '../translate/translate';

function DetalhesCaravanaUsuario({ caravana, onClose }) {
    const [descricaoLocalidade, setDescricaoLocalidade] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    const [funcionarios, setFuncionarios] = useState([]);
    const [loadingFuncionarios, setLoadingFuncionarios] = useState(true);
    const [errorFuncionarios, setErrorFuncionarios] = useState(null); // Adicionado estado de erro

    useEffect(() => {
        const fetchFuncionarios = async () => {
             if(!caravana) return;
            setLoadingFuncionarios(true);
            setErrorFuncionarios(null); // Limpa erro anterior
            try {
                const funcData = await api.getFuncionarios();
                setFuncionarios(funcData);
            } catch (err) {
                console.error("Erro ao buscar funcionários:", err);
                setErrorFuncionarios("Falha ao carregar dados da equipe.");
            }
            finally { setLoadingFuncionarios(false); }
        };
        if (caravana) fetchFuncionarios();
    }, [caravana]);


    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                setIsLoadingDesc(true);
                try {
                    const localidadeData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricaoLocalidade(localidadeData.descricao || '');
                } catch (error) { console.error(error); setDescricaoLocalidade('Erro ao carregar descrição.'); }
                finally { setIsLoadingDesc(false); }
            } else { setDescricaoLocalidade('N/A'); }
        };
        if (caravana) fetchDescricao();
    }, [caravana]);

     const getNomeFuncionario = (uid) => {
        if (!uid) return 'A ser confirmado';
        if (loadingFuncionarios) return 'Carregando...';
        const func = funcionarios.find(f => (f.uid || f.id) === uid);
        return func ? func.nome : 'A ser confirmado';
    };

    const formatarDataHora = (dateTimeString) => {
        if (!dateTimeString) return 'A definir';
        try {
            const dt = new Date(dateTimeString);
            if (!isNaN(dt.getTime())) {
                return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            }
        } catch (e) { console.warn("Erro ao formatar data/hora:", dateTimeString); }
        return 'Inválido';
    };

    const EmployeeInfoBasic = ({ uid, role }) => {
         const nome = getNomeFuncionario(uid);
        return (
             <p className={styles.infoItem}><strong>{role}:</strong> {nome}</p>
        );
    };

    if (!caravana) return <div className={styles.container}>Selecione uma caravana para ver os detalhes.</div>;

    const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Sua Caravana</h2>
            {(caravana.imagemCapaLocalidade || (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0)) && (
                <img
                    src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade[0]}
                    alt={caravana.nomeLocalidade || 'Localidade'}
                    className={styles.image}
                    onError={(e) => {
                         e.target.onerror = null;
                         if (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 1 && e.target.src !== caravana.imagensLocalidade[1]) {
                            e.target.src = caravana.imagensLocalidade[1];
                         } else {
                            e.target.src = "./images/imagem_padrao.jpg";
                         }
                    }}
                />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data Viagem: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
            <p className={styles.infoItem}><strong>Ponto de Encontro:</strong> {caravana.pontoEncontro || 'A definir (verifique próximo à data)'}</p>
            <p className={styles.infoItem}><strong>Horário Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Retorno Estimado:</strong> {formatarDataHora(caravana.dataHoraRetorno)}</p>
            <p className={styles.infoItem}><strong>Ingressos Comprados por você:</strong> {caravana.quantidadeTotalUsuario || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricaoLocalidade || 'Sem descrição disponível.'}</p>}
            </div>

            <div className={styles.infoSection}>
                <h3>Equipe Prevista (Confirmada Próximo à Data)</h3>
                {errorFuncionarios && <p className={styles.errorSmall}>{errorFuncionarios}</p>}
                 {!transporteDefinido ? (
                     <>
                         <EmployeeInfoBasic uid={caravana.administradorUid} role="Administrador" />
                         <EmployeeInfoBasic uid={caravana.motoristaUid} role="Motorista" />
                     </>
                 ) : (
                    <>
                        <p className={styles.infoItem}><strong>Administrador(es) do(s) Veículo(s):</strong> {loadingFuncionarios ? 'Carregando...' : (Array.from(new Set(caravana.transportesFinalizados?.map(t => t.administradorUid).filter(Boolean))).map(uid => getNomeFuncionario(uid)).join(', ') || 'A ser confirmado')}</p>
                        <p className={styles.infoItem}><strong>Motorista(s) do(s) Veículo(s):</strong> {loadingFuncionarios ? 'Carregando...' : (Array.from(new Set(caravana.transportesFinalizados?.map(t => t.motoristaUid).filter(Boolean))).map(uid => getNomeFuncionario(uid)).join(', ') || 'A ser confirmado')}</p>
                    </>
                 )}
                <EmployeeInfoBasic uid={caravana.guiaUid} role="Guia" />
            </div>

        </div>
    );
}

export default DetalhesCaravanaUsuario;