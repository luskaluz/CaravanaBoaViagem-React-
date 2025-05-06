import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styles from '../Usuario/DetalhesCaravanaUsuario.module.css';
import * as api from '../../services/api';
import translateStatus from '../translate/translate';
import { auth } from '../../services/firebase';

const PLACEHOLDER_FUNC_IMG = "https://via.placeholder.com/80x80?text=Equipe";
const PLACEHOLDER_USER_IMG = "https://via.placeholder.com/80x80?text=Eu";

function DetalhesCaravanaUsuario({ caravana, usuarioLogado }) {
    const [descricaoLocalidade, setDescricaoLocalidade] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    const [todosFuncionarios, setTodosFuncionarios] = useState([]);
    const [loadingEquipe, setLoadingEquipe] = useState(true);
    const [errorEquipe, setErrorEquipe] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const fetchAllFuncionarios = async () => {
            if (!isMounted) return;
            setLoadingEquipe(true);
            setErrorEquipe(null);
            try {
                const funcData = await api.getFuncionarios();
                if (isMounted) {
                    setTodosFuncionarios(funcData || []);
                }
            } catch (err) {
                console.error("Erro DetalhesCaravanaUsuario: buscar todos os funcionários:", err);
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

    const getFuncionarioDetalhado = useCallback((uid) => {
        if (!uid) return null;
        if (loadingEquipe) return { nome: 'Carregando...', isLoading: true, uid };
        if (errorEquipe) return { nome: 'Falha ao carregar equipe', isError: true, uid };
        const funcionarioEncontrado = todosFuncionarios.find(f => f.uid === uid || f.id === uid);
        if (funcionarioEncontrado) {
            return { ...funcionarioEncontrado, isLoading: false, isError: false };
        }
        return { nome: `Responsável (ID: ${uid.substring(0,6)}...)`, isNotFound: true, isLoading: false, uid };
    }, [todosFuncionarios, loadingEquipe, errorEquipe]);

    const formatarDataHora = (dateTimeString) => {
        if (!dateTimeString) return 'A definir';
        try {
            const dt = new Date(dateTimeString);
            if (!isNaN(dt.getTime())) {
                return dt.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                    timeZone: 'America/Sao_Paulo'
                });
            }
        } catch (e) { console.warn("Erro ao formatar data/hora:", dateTimeString); }
        return 'Inválido';
    };

    const equipeDaCaravana = useMemo(() => {
        const resultado = {
            guia: caravana ? getFuncionarioDetalhado(caravana.guiaUid) : null,
            adminsDosVeiculos: new Map(),
            motoristasDosVeiculos: new Map()
        };
        if (!caravana || loadingEquipe || errorEquipe) return resultado;
        const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;
        if (transporteDefinido && Array.isArray(caravana.transportesFinalizados)) {
            caravana.transportesFinalizados.forEach((veiculo) => {
                if (veiculo.administradorUid) {
                    const admin = getFuncionarioDetalhado(veiculo.administradorUid);
                    if (admin && !admin.isNotFound && !resultado.adminsDosVeiculos.has(admin.uid || admin.id)) {
                        resultado.adminsDosVeiculos.set(admin.uid || admin.id, admin);
                    }
                }
                if (veiculo.motoristaUid) {
                    const motorista = getFuncionarioDetalhado(veiculo.motoristaUid);
                    if (motorista && !motorista.isNotFound && !resultado.motoristasDosVeiculos.has(motorista.uid || motorista.id)) {
                        resultado.motoristasDosVeiculos.set(motorista.uid || motorista.id, motorista);
                    }
                }
            });
        }
        return resultado;
    }, [caravana, getFuncionarioDetalhado, loadingEquipe, errorEquipe]);

    const RenderFuncionarioCard = ({ funcionarioData, role, isCurrentUser = false }) => {
        const targetData = isCurrentUser ? usuarioLogado : funcionarioData;
        if (!targetData && !isCurrentUser) return <p className={styles.infoItem}><strong>{role}:</strong> A ser confirmado</p>;
        if (isCurrentUser && !targetData) return <p className={styles.infoItem}><strong>{role}:</strong> Dados do usuário não carregados</p>;
        if (targetData?.isLoading) return <p className={styles.infoItem}><strong>{role}:</strong> Carregando...</p>;
        if (targetData?.isError && !targetData?.isNotFound) return <p className={styles.infoItemError}><strong>{role}:</strong> {targetData.nome}</p>;
        if (targetData?.isNotFound) return <p className={styles.infoItem}><strong>{role}:</strong> {targetData.nome}</p>;

        const foto = targetData.fotoUrl || (isCurrentUser && auth.currentUser?.photoURL) || (isCurrentUser ? PLACEHOLDER_USER_IMG : PLACEHOLDER_FUNC_IMG);
        const nome = targetData.nome || (isCurrentUser && auth.currentUser?.displayName) || 'Nome não disponível';
        const email = targetData.email || (isCurrentUser && auth.currentUser?.email) || 'N/A';
        const telefone = targetData.telefone || 'N/A';

        return (
            <div className={styles.funcionarioCard}>
                <img
                    src={foto}
                    alt={nome}
                    className={styles.funcionarioFoto}
                    onError={(e) => { e.target.onerror = null; e.target.src = isCurrentUser ? PLACEHOLDER_USER_IMG : PLACEHOLDER_FUNC_IMG; }}
                />
                <div className={styles.funcionarioInfo}>
                    <p className={styles.funcionarioNome}><strong>{role}:</strong> {nome}</p>
                    <p className={styles.funcionarioDetalheSmall}><strong>Email:</strong> {email}</p>
                    <p className={styles.funcionarioDetalheSmall}><strong>Telefone:</strong> {telefone}</p>
                </div>
            </div>
        );
    };

    if (!caravana) return <div className={styles.container}>Selecione uma caravana para ver os detalhes.</div>;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Sua Caravana</h2>
            {usuarioLogado && (
                <div className={styles.infoSection}>
                    <h3>Seus Dados</h3>
                    <RenderFuncionarioCard
                        funcionarioData={null}
                        role="Participante"
                        isCurrentUser={true}
                    />
                    <p className={styles.infoItem}><strong>Ingressos Comprados por você:</strong> {caravana.quantidadeTotalUsuario || 'N/A'}</p>
                </div>
            )}
            <hr className={styles.separator} />
            {(caravana.imagemCapaLocalidade || (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0)) && (
                <img src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade[0]} alt={caravana.nomeLocalidade || 'Localidade'} className={styles.image} onError={(e) => {
                    e.target.onerror = null;
                    if (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 1 && e.target.src !== caravana.imagensLocalidade[1]) {
                        e.target.src = caravana.imagensLocalidade[1];
                    } else {
                        e.target.src = "./images/imagem_padrao.jpg";
                    }
                }} />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data Viagem: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
            <p className={styles.infoItem}><strong>Ponto de Encontro:</strong> {caravana.pontoEncontro || 'A definir (verifique próximo à data)'}</p>
            <p className={styles.infoItem}><strong>Horário Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Retorno Estimado:</strong> {formatarDataHora(caravana.dataHoraRetorno)}</p>
            <p className={styles.infoItem}><strong>Status:</strong> {translateStatus(caravana.status)}</p>
            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricaoLocalidade || 'Sem descrição disponível.'}</p>}
            </div>
            <div className={styles.infoSection}>
                <h3>Equipe Responsável</h3>
                {errorEquipe && <p className={`${styles.errorSmall} ${styles.infoItemError}`}>{errorEquipe}</p>}
                {!loadingEquipe && !errorEquipe && <RenderFuncionarioCard funcionarioData={equipeDaCaravana.guia} role="Guia" />}

                {(!loadingEquipe && !errorEquipe && equipeDaCaravana.adminsDosVeiculos.size > 0) && <h4>Administrador(es) da Viagem:</h4>}
                {loadingEquipe && !errorEquipe && <p>Carregando administradores...</p>}
                {!loadingEquipe && !errorEquipe && equipeDaCaravana.adminsDosVeiculos.size > 0 ? (
                    Array.from(equipeDaCaravana.adminsDosVeiculos.values()).map(admin => <RenderFuncionarioCard key={admin.uid || admin.id} funcionarioData={admin} role="Admin" />)
                ) : ( !loadingEquipe && !errorEquipe && <p className={styles.infoItem}>Admin: A ser confirmado</p> )}

                 {(!loadingEquipe && !errorEquipe && equipeDaCaravana.motoristasDosVeiculos.size > 0) && <h4>Motorista(s) da Viagem:</h4>}
                 {loadingEquipe && !errorEquipe && <p>Carregando motoristas...</p>}
                 {!loadingEquipe && !errorEquipe && equipeDaCaravana.motoristasDosVeiculos.size > 0 ? (
                    Array.from(equipeDaCaravana.motoristasDosVeiculos.values()).map(motorista => <RenderFuncionarioCard key={motorista.uid || motorista.id} funcionarioData={motorista} role="Motorista" />)
                ) : ( !loadingEquipe  && !errorEquipe && <p className={styles.infoItem}>Motorista: A ser confirmado</p> )}
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