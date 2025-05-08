import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './DetalhesCaravanaUsuario.module.css';
import * as api from '../../services/api';
import translateStatus from '../translate/translate';
import { auth } from '../../services/firebase'; // Precisa do auth para pegar UID do usuário

const PLACEHOLDER_FUNC_IMG = "https://via.placeholder.com/80x80?text=Equipe"; // Mantido, embora não usado

function DetalhesCaravanaUsuario({ caravana }) {
    const [descricaoLocalidade, setDescricaoLocalidade] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    const [todosFuncionarios, setTodosFuncionarios] = useState([]);
    const [loadingEquipe, setLoadingEquipe] = useState(true);
    const [errorEquipe, setErrorEquipe] = useState(null);
    const [quantidadeUsuario, setQuantidadeUsuario] = useState(null);
    const [loadingIngressos, setLoadingIngressos] = useState(false);
    const [errorIngressos, setErrorIngressos] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const fetchAllFuncionarios = async () => {
            if (!isMounted) return;
            setLoadingEquipe(true); setErrorEquipe(null);
            try {
                const funcData = await api.getFuncionarios();
                if (isMounted) setTodosFuncionarios(funcData || []);
            } catch (err) {
                console.error("Erro DetalhesUser: buscar todos os funcionários:", err);
                if (isMounted) setErrorEquipe("Falha ao carregar dados da equipe.");
            } finally {
                if (isMounted) setLoadingEquipe(false);
            }
        };
        fetchAllFuncionarios();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                if (isMounted) setIsLoadingDesc(true);
                try {
                    const localidadeData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    if (isMounted) setDescricaoLocalidade(localidadeData.descricao || '');
                } catch (error) {
                    console.error("Erro ao buscar descrição:", error);
                    if (isMounted) setDescricaoLocalidade('Erro ao carregar descrição.');
                } finally {
                    if (isMounted) setIsLoadingDesc(false);
                }
            } else {
                if (isMounted) setDescricaoLocalidade('N/A');
            }
        };
        if (caravana) fetchDescricao();
        return () => { isMounted = false; };
    }, [caravana]);

    useEffect(() => {
        let isMounted = true;
        const fetchQuantidade = async () => {
            const currentUser = auth.currentUser;
            if (caravana && caravana.id && currentUser) {
                 if(isMounted) { setLoadingIngressos(true); setErrorIngressos(null); }
                try {
                    const resultado = await api.getMeusIngressosCaravana(caravana.id);
                    if (isMounted) setQuantidadeUsuario(resultado.quantidadeTotalUsuario);
                } catch (err) {
                     console.error("Erro ao buscar quantidade de ingressos:", err);
                     if (isMounted) setErrorIngressos("Erro ao buscar seus ingressos.");
                } finally {
                    if (isMounted) setLoadingIngressos(false);
                }
            } else {
                 if (isMounted) { setQuantidadeUsuario(0); setLoadingIngressos(false); }
            }
        };
        fetchQuantidade();
         return () => { isMounted = false; };
    }, [caravana]);

    const getNomeFuncionario = useCallback((uid) => {
        if (!uid) return 'A ser confirmado';
        if (loadingEquipe) return 'Carregando...';
        if (errorEquipe) return 'Indisponível';
        const func = todosFuncionarios.find(f => (f.uid === uid || f.id === uid));
        const nomeEncontrado = func ? func.nome : null;
        // Retorna o nome ou uma string indicando que não foi encontrado mas o UID existe
        return nomeEncontrado ? nomeEncontrado : `Responsável (ID: ${uid.substring(0,6)}...)`;
    }, [todosFuncionarios, loadingEquipe, errorEquipe]);

    const formatarDataHora = (dateTimeString) => {
        if (!dateTimeString) return 'A definir';
        try {
            const dt = new Date(dateTimeString);
            if (!isNaN(dt.getTime())) {
                return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            }
        } catch (e) { /* ignora erro */ }
        return 'Inválido';
    };

    // useMemo ajustado para popular os Sets de nomes
    const equipeNomes = useMemo(() => {
        const resultado = {
            guiaNome: caravana ? getNomeFuncionario(caravana.guiaUid) : 'A ser confirmado',
            adminNomes: new Set(),
            motoristaNomes: new Set()
        };
        if (!caravana || loadingEquipe || errorEquipe) return resultado;

        const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

        if (transporteDefinido && Array.isArray(caravana.transportesFinalizados)) {
            caravana.transportesFinalizados.forEach((v) => {
                if (v.administradorUid) {
                    const nomeAdmin = getNomeFuncionario(v.administradorUid);
                    // Adiciona ao Set apenas se o nome for válido/encontrado
                    if (nomeAdmin && !nomeAdmin.toLowerCase().includes('não encontrado') && !nomeAdmin.toLowerCase().includes('carregando') && !nomeAdmin.toLowerCase().includes('indisponível')) {
                        resultado.adminNomes.add(nomeAdmin);
                    }
                }
                if (v.motoristaUid) {
                     const nomeMotorista = getNomeFuncionario(v.motoristaUid);
                     if (nomeMotorista && !nomeMotorista.toLowerCase().includes('não encontrado') && !nomeMotorista.toLowerCase().includes('carregando') && !nomeMotorista.toLowerCase().includes('indisponível')) {
                        resultado.motoristaNomes.add(nomeMotorista);
                    }
                }
            });
        }
        return resultado;
    }, [caravana, getNomeFuncionario, loadingEquipe, errorEquipe, todosFuncionarios]); // Adicionado todosFuncionarios


    if (!caravana) return <div className={styles.container}>Selecione uma caravana para ver os detalhes.</div>;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Sua Caravana</h2>

            {(caravana.imagemCapaLocalidade || (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0)) && (
                <img src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade[0]} alt={caravana.nomeLocalidade || 'Localidade'} className={styles.image} onError={(e) => { /* fallback */}} />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data Viagem: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
            <p className={styles.infoItem}><strong>Ponto de Encontro:</strong> {caravana.pontoEncontro || 'A definir (verifique próximo à data)'}</p>
            <p className={styles.infoItem}><strong>Horário Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Retorno Estimado:</strong> {formatarDataHora(caravana.dataHoraRetorno)}</p>
            <p className={styles.infoItem}><strong>Status:</strong> {translateStatus(caravana.status)}</p>
            <p className={styles.infoItem}>
                <strong>Ingressos Comprados por você:</strong> {
                    loadingIngressos ? 'Buscando...' :
                    errorIngressos ? <span className={styles.errorSmall}>{errorIngressos}</span> :
                    (quantidadeUsuario !== null ? quantidadeUsuario : 'N/A')
                }
            </p>

            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricaoLocalidade || 'Sem descrição disponível.'}</p>}
            </div>

            <div className={styles.infoSection}>
                <h3>Equipe Responsável (Prevista)</h3>
                {errorEquipe && <p className={`${styles.errorSmall} ${styles.infoItemError}`}>{errorEquipe}</p>}
                <p className={styles.infoItem}><strong>Guia:</strong> {equipeNomes.guiaNome}</p>
                <p className={styles.infoItem}><strong>Administrador(es):</strong>
                    {loadingEquipe ? ' Carregando...' :
                     equipeNomes.adminNomes.size > 0 ? Array.from(equipeNomes.adminNomes).join(', ') : 'A ser confirmado'}
                </p>
                 <p className={styles.infoItem}><strong>Motorista(s):</strong>
                    {loadingEquipe ? ' Carregando...' :
                     equipeNomes.motoristaNomes.size > 0 ? Array.from(equipeNomes.motoristaNomes).join(', ') : 'A ser confirmado'}
                 </p>
            </div>

             {(caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido) && Array.isArray(caravana.transportesFinalizados) && caravana.transportesFinalizados.length > 0 && (
                 <div className={styles.infoSection}>
                    <h4>Transporte(s) Designado(s)</h4>
                    <ul className={styles.vehicleListSimple}>
                        {caravana.transportesFinalizados.map((v, index) => (
                            <li key={`${v.tipoId || 'tipo'}-${index}`}>
                                Veículo {index + 1}: {v.nomeTipo || 'Tipo não especificado'}
                                {v.placa && ` (Placa: ${v.placa})`}
                            </li>
                        ))}
                    </ul>
                    <p className={styles.transportNote}>Sua alocação específica no veículo será informada pela equipe ou por e-mail mais próximo à data da viagem.</p>
                 </div>
            )}
        </div>
    );
}

export default DetalhesCaravanaUsuario;