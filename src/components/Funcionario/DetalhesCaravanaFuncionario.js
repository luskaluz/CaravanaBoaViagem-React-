import React, { useState, useEffect, useMemo } from 'react';
import styles from '../Usuario/DetalhesCaravanaUsuario.module.css'; // Reutiliza estilos
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
                    const descricaoData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricao(descricaoData.descricao || '');
                } catch (err) { console.error(err); setDescricao('Erro ao carregar descrição.'); }
                finally { setIsLoadingDesc(false); }
            } else { setDescricao('N/A'); }
        };
        if (caravana) fetchDescricao();
    }, [caravana]);

    const getNomeFuncionario = (uid) => {
        if (!uid) return 'Não Definido';
        if (loadingFuncionarios) return 'Carregando...';
        const func = funcionarios.find(f => (f.uid || f.id) === uid);
        return func ? func.nome : `Não Encontrado`; // Simplificado
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

    if (!caravana) return <div className={styles.container}>Caravana não encontrada.</div>;

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
            <h2 className={styles.title}>Detalhes da Caravana (Funcionário)</h2>
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
                 <h3>Equipe Geral Atribuída</h3>
                 <p className={styles.infoItem}><strong>Guia:</strong> {getNomeFuncionario(caravana.guiaUid)}</p>
                 {errorFuncionarios && <p className={styles.errorSmall}>{errorFuncionarios}</p>}
                 {/* Não mostra mais admin/motorista geral se o transporte foi finalizado */}
                 {!transporteDefinido && (
                     <>
                         <p className={styles.infoItem}><strong>Administrador Principal (Pré-Definição):</strong> {getNomeFuncionario(caravana.administradorUid)}</p>
                         <p className={styles.infoItem}><strong>Motorista Principal (Pré-Definição):</strong> {getNomeFuncionario(caravana.motoristaUid)}</p>
                     </>
                 )}
             </div>

             {transporteDefinido && Array.isArray(caravana.transportesFinalizados) && caravana.transportesFinalizados.length > 0 && (
                 <div className={styles.infoSection}>
                     <h3>Veículos e Responsáveis Definidos</h3>
                     {loadingFuncionarios && <p>Carregando nomes...</p>}
                     {errorFuncionarios && <p className={styles.errorSmall}>{errorFuncionarios}</p>}
                     <ul className={styles.vehicleList}>
                         {caravana.transportesFinalizados.map((v, index) => (
                             <li key={`${v.tipoId}-${index}-${v.placa || index}`} className={styles.vehicleListItem}>
                                 <strong>Veículo {index+1}: {v.nomeTipo}</strong> ({v.assentos} assentos)
                                 {v.placa && ` - Placa: ${v.placa}`} <br/>
                                 <span className={styles.responsible}><strong>Admin do Veículo:</strong> {getNomeFuncionario(v.administradorUid)}</span> <br/>
                                 <span className={styles.responsible}><strong>Motorista do Veículo:</strong> {getNomeFuncionario(v.motoristaUid)}</span>
                             </li>
                         ))}
                     </ul>
                 </div>
             )}

             <div className={styles.infoSection}>
                <h3>Participantes e Capacidade</h3>
                <p className={styles.infoItem}><strong>Inscritos (Clientes):</strong> {caravana.vagasOcupadas || 0}</p>
                <p className={styles.infoItem}><strong>Capacidade Total Exibida:</strong> {capacidadeExibida > 0 ? capacidadeExibida : 'Não definida'}</p>
                <p className={styles.infoItem}><strong>Vagas Disponíveis (Clientes):</strong> {capacidadeExibida > 0 ? vagasDisponiveisParaClientes : 'N/A'}</p>
             </div>
        </div>
    );
}

export default DetalhesCaravanaFuncionario;