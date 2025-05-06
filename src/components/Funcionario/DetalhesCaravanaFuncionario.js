import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styles from '../Usuario/DetalhesCaravanaUsuario.module.css'; // Reutilizando estilos
import * as api from '../../services/api';
import translateStatus from '../translate/translate';

function DetalhesCaravanaFuncionario({ caravana }) {
    const [descricao, setDescricao] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);
    const [funcionarios, setFuncionarios] = useState([]);
    const [loadingFuncionarios, setLoadingFuncionarios] = useState(true);
    const [errorFuncionarios, setErrorFuncionarios] = useState(null);

    useEffect(() => {
        const fetchFuncionarios = async () => {
            if (!caravana) return;
            setLoadingFuncionarios(true);
            setErrorFuncionarios(null);
            try {
                const funcData = await api.getFuncionarios();
                setFuncionarios(funcData);
            } catch (err) {
                console.error("Erro DetalhesFunc: buscar funcionários:", err);
                setErrorFuncionarios("Falha ao carregar nomes da equipe.");
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
                    const descricaoData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricao(descricaoData.descricao || '');
                } catch (err) { console.error(err); setDescricao('Erro ao carregar descrição.'); }
                finally { setIsLoadingDesc(false); }
            } else {
                setDescricao('N/A');
            }
        };
        if (caravana) fetchDescricao();
    }, [caravana]);

    const getNomeFuncionario = useCallback((uid) => {
        if (!uid) return 'Não Definido';
        if (loadingFuncionarios) return 'Carregando...';
        if (errorFuncionarios) return 'Erro Equipe';
        const func = funcionarios.find(f => (f.uid === uid || f.id === uid));
        return func ? func.nome : `Funcionário (ID: ${uid.substring(0, 6)}...) Não Encontrado`;
    }, [funcionarios, loadingFuncionarios, errorFuncionarios]);

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

    const detalhesEquipeVeiculos = useMemo(() => {
        const resultado = {
            guiaNome: caravana ? getNomeFuncionario(caravana.guiaUid) : 'N/A',
            adminsVeiculos: new Map(),
            motoristasVeiculos: new Map(),
            veiculosInfo: []
        };
        if (!caravana) return resultado;

        const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

        if (transporteDefinido && Array.isArray(caravana.transportesFinalizados)) {
            caravana.transportesFinalizados.forEach((v, index) => {
                const adminNome = getNomeFuncionario(v.administradorUid);
                const motoristaNome = getNomeFuncionario(v.motoristaUid);

                if (v.administradorUid && !resultado.adminsVeiculos.has(v.administradorUid)) {
                    resultado.adminsVeiculos.set(v.administradorUid, adminNome);
                }
                if (v.motoristaUid && !resultado.motoristasVeiculos.has(v.motoristaUid)) {
                    resultado.motoristasVeiculos.set(v.motoristaUid, motoristaNome);
                }
                resultado.veiculosInfo.push({
                    id: v.idInternoVeiculo || `${v.tipoId}-${index}`, // Usa um ID interno se vier do backend, senão gera
                    nomeTipo: v.nomeTipo,
                    assentos: v.assentos,
                    placa: v.placa,
                    adminNome: adminNome,
                    motoristaNome: motoristaNome
                });
            });
        }
        return resultado;
    }, [caravana, getNomeFuncionario]);


    if (!caravana) return <div className={styles.container}>Caravana não selecionada.</div>;

    const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;
    const capacidadeExibida = transporteDefinido
                             ? (caravana.capacidadeFinalizada || 0)
                             : (caravana.capacidadeMaximaTeorica || 0);

    let numAdminsConsiderados = 0;
    if (capacidadeExibida > 0) {
        if (transporteDefinido && Array.isArray(caravana.transportesFinalizados)) {
            numAdminsConsiderados = Math.min(capacidadeExibida, caravana.transportesFinalizados.length);
        } else {
            numAdminsConsiderados = Math.min(capacidadeExibida, caravana.maximoTransportes || 0);
        }
    }
    const vagasDisponiveisParaClientes = Math.max(0, capacidadeExibida - (caravana.vagasOcupadas || 0) - numAdminsConsiderados);

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Caravana</h2>
            {(caravana.imagemCapaLocalidade || (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0)) && (
                <img
                    src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade[0]}
                    alt={caravana.nomeLocalidade || 'Localidade'}
                    className={styles.image}
                    onError={(e) => { e.target.onerror = null; e.target.src="./images/imagem_padrao.jpg" }}
                />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data Viagem: </strong>{caravana.data ? new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</p>
            <p className={styles.infoItem}><strong>Ponto de Encontro:</strong> {caravana.pontoEncontro || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Horário Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Retorno Estimado:</strong> {formatarDataHora(caravana.dataHoraRetorno)}</p>
            <p className={styles.infoItem}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricao || 'Sem descrição disponível.'}</p>}
            </div>

             <div className={styles.infoSection}>
                 <h3>Equipe Responsável</h3>
                 {errorFuncionarios && <p className={styles.errorSmall}>{errorFuncionarios}</p>}
                 <p className={styles.infoItem}><strong>Guia:</strong> {detalhesEquipeVeiculos.guiaNome}</p>

                 <p className={styles.infoItem}><strong>Administrador(es) da Viagem:</strong>
                    {loadingFuncionarios ? ' Carregando...' :
                     detalhesEquipeVeiculos.adminsVeiculos.size > 0 ?
                     Array.from(detalhesEquipeVeiculos.adminsVeiculos.values()).join(', ') :
                     'A ser confirmado'}
                 </p>
                 <p className={styles.infoItem}><strong>Motorista(s) da Viagem:</strong>
                    {loadingFuncionarios ? ' Carregando...' :
                     detalhesEquipeVeiculos.motoristasVeiculos.size > 0 ?
                     Array.from(detalhesEquipeVeiculos.motoristasVeiculos.values()).join(', ') :
                     'A ser confirmado'}
                 </p>
             </div>

             {detalhesEquipeVeiculos.veiculosInfo.length > 0 && (
                 <div className={styles.infoSection}>
                     <h3>Veículos Definidos</h3>
                     {loadingFuncionarios && <p>Carregando nomes...</p>}
                     {errorFuncionarios && <p className={styles.errorSmall}>{errorFuncionarios}</p>}
                     <ul className={styles.vehicleList}>
                         {detalhesEquipeVeiculos.veiculosInfo.map((v) => (
                             <li key={v.id} className={styles.vehicleListItem}>
                                 <strong>{v.nomeTipo}</strong> ({v.assentos} assentos)
                                 {v.placa && ` - Placa: ${v.placa}`} <br/>
                                 <span className={styles.responsible}>Admin do Veículo: {v.adminNome}</span> <br/>
                                 <span className={styles.responsible}>Motorista do Veículo: {v.motoristaNome}</span>
                             </li>
                         ))}
                     </ul>
                 </div>
             )}

             <div className={styles.infoSection}>
                <h3>Participantes e Capacidade</h3>
                <p className={styles.infoItem}><strong>Inscritos (Clientes):</strong> {caravana.vagasOcupadas || 0}</p>
                <p className={styles.infoItem}>
                    <strong>Capacidade Total:</strong> {capacidadeExibida > 0 ? capacidadeExibida : 'Não definida'}
                </p>
                <p className={styles.infoItem}>
                    <strong>Vagas Disponíveis (Clientes):</strong> {capacidadeExibida > 0 ? vagasDisponiveisParaClientes : 'N/A'}
                </p>
             </div>
        </div>
    );
}

export default DetalhesCaravanaFuncionario;