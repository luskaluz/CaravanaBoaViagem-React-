import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../../services/api';
import styles from './DetalhesCaravanaAdmin.module.css';
import translateStatus from '../translate/translate';

function DetalhesCaravanaAdmin({ caravana }) {
    const [funcionarios, setFuncionarios] = useState([]);
    const [loadingFuncionarios, setLoadingFuncionarios] = useState(true);
    const [errorFuncionarios, setErrorFuncionarios] = useState(null);

    useEffect(() => {
        const fetchFuncionarios = async () => {
            setLoadingFuncionarios(true);
            setErrorFuncionarios(null);
            try {
                const funcData = await api.getFuncionarios();
                setFuncionarios(funcData);
            } catch (err) {
                console.error("Erro ao buscar funcionários para detalhes:", err);
                setErrorFuncionarios("Não foi possível carregar nomes dos funcionários.");
            } finally {
                setLoadingFuncionarios(false);
            }
        };
        fetchFuncionarios();
    }, []);

    const getNomeFuncionario = (uid) => {
        if (!uid) return 'Não definido';
        if (loadingFuncionarios) return 'Carregando...';
        const func = funcionarios.find(f => (f.uid || f.id) === uid);
        return func ? func.nome : `UID: ${uid} (Não encontrado)`;
    };

    const formatarData = (dataString) => {
        if (!dataString) return 'N/A';
        return new Date(dataString + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    const formatarDataHora = (dateTimeString) => {
        if (!dateTimeString) return 'A definir';
        try {
            const dt = new Date(dateTimeString);
            if (!isNaN(dt.getTime())) {
                return dt.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                    timeZone: 'America/Sao_Paulo' // Força o timezone
                });
            }
        } catch (e) { console.warn("Erro ao formatar data/hora:", dateTimeString); }
        return 'Inválido';
    };


    const detalhesPessoal = useMemo(() => {
        const resultado = { admins: new Map(), motoristas: new Map(), guiaNome: getNomeFuncionario(caravana.guiaUid) };
        const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

        if (transporteDefinido && Array.isArray(caravana.transportesFinalizados)) {
            caravana.transportesFinalizados.forEach(transporte => {
                if (transporte.administradorUid && !resultado.admins.has(transporte.administradorUid)) {
                     resultado.admins.set(transporte.administradorUid, { uid: transporte.administradorUid, nome: getNomeFuncionario(transporte.administradorUid)});
                }
                if (transporte.motoristaUid && !resultado.motoristas.has(transporte.motoristaUid)) {
                    resultado.motoristas.set(transporte.motoristaUid, { uid: transporte.motoristaUid, nome: getNomeFuncionario(transporte.motoristaUid)});
                }
            });
        }
        return resultado;
    }, [caravana, funcionarios, loadingFuncionarios, getNomeFuncionario]);

    const capacidadeExibida = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido
                             ? (caravana.capacidadeFinalizada || 0)
                             : (caravana.capacidadeMaximaTeorica || 0);

    const numAdminsConsiderados = useMemo(() => {
         let numAdmins = 0;
         const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;
         if (transporteDefinido) {
             if (capacidadeExibida > 0 && Array.isArray(caravana.transportesFinalizados)) {
                 numAdmins = Math.min(capacidadeExibida, caravana.transportesFinalizados.length);
             }
         } else {
             if (capacidadeExibida > 0) {
                 numAdmins = Math.min(capacidadeExibida, caravana.maximoTransportes || 0);
             }
         }
         return numAdmins;
    }, [caravana, capacidadeExibida]);


    const vagasClientesDisponiveis = Math.max(0, capacidadeExibida - (caravana.vagasOcupadas || 0) - numAdminsConsiderados);

    return (
        <div className={styles.detalhesContainer}>
            <h2>Detalhes da Caravana: {caravana.nomeLocalidade}</h2>

            <div className={styles.gridDetalhes}>
                <div className={styles.detalheItem}><span className={styles.label}>Status:</span> {translateStatus(caravana.status)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Data Viagem:</span> {formatarData(caravana.data)}</div>
                <div className={`${styles.detalheItem} ${styles.fullWidth}`}>
                    <span className={styles.label}>Ponto de Encontro:</span> {caravana.pontoEncontro || 'A definir'}
                </div>
                <div className={styles.detalheItem}><span className={styles.label}>Horário Saída:</span> {caravana.horarioSaida || 'A definir'}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Retorno Estimado:</span> {formatarDataHora(caravana.dataHoraRetorno)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Data Conf. Transporte:</span> {formatarData(caravana.dataConfirmacaoTransporte)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Data Limite Vendas:</span> {formatarData(caravana.dataFechamentoVendas)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Ocupação Mínima:</span> {caravana.ocupacaoMinima}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Vagas Ocupadas (Clientes):</span> {caravana.vagasOcupadas || 0}</div>
                <div className={styles.detalheItem}>
                    <span className={styles.label}>Capacidade Total:</span>
                    {capacidadeExibida > 0 ? capacidadeExibida : 'Não definida'}
                </div>
                 <div className={styles.detalheItem}>
                    <span className={styles.label}>Vagas Disp. (Clientes):</span>
                    {capacidadeExibida > 0 ? vagasClientesDisponiveis : 'N/A'}
                </div>
                <div className={styles.detalheItem}><span className={styles.label}>Preço:</span> R$ {(caravana.preco || 0).toFixed(2)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Despesas:</span> R$ {(caravana.despesas || 0).toFixed(2)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Lucro Desejado:</span> R$ {(caravana.lucroAbsoluto || 0).toFixed(2)}</div>

                <div className={styles.secaoPessoal}>
                    <h3>Equipe Responsável</h3>
                    {errorFuncionarios && <p className={styles.error}>{errorFuncionarios}</p>}
                    <p><span className={styles.label}>Guia:</span> {detalhesPessoal.guiaNome}</p>
                    <div>
                        <span className={styles.label}>Administrador(es):</span>
                        {loadingFuncionarios ? <p>Carregando...</p> : detalhesPessoal.admins.size > 0 ? (
                            <ul>{Array.from(detalhesPessoal.admins.values()).map(a => <li key={a.uid}>{a.nome}</li>)}</ul>
                        ) : ( <p>Nenhum admin definido.</p> )}
                    </div>
                     <div>
                        <span className={styles.label}>Motorista(s):</span>
                        {loadingFuncionarios ? <p>Carregando...</p> : detalhesPessoal.motoristas.size > 0 ? (
                            <ul>{Array.from(detalhesPessoal.motoristas.values()).map(m => <li key={m.uid}>{m.nome}</li>)}</ul>
                        ) : ( <p>Nenhum motorista definido.</p> )}
                    </div>
                </div>

                 {(caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido) && caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0 && (
                     <div className={styles.secaoVeiculos}>
                         <h3>Veículos Definidos</h3>
                         {loadingFuncionarios && <p>Carregando detalhes...</p>}
                         <ul>
                             {caravana.transportesFinalizados.map((v, index) => (
                                 <li key={`${v.tipoId}-${index}`}>
                                     <strong>{v.nomeTipo || `Tipo (${v.tipoId})`}</strong> ({v.assentos} assentos)
                                     {v.placa && ` - Placa: ${v.placa}`}
                                     {v.motoristaUid && ` - Motorista: ${getNomeFuncionario(v.motoristaUid)}`}
                                     {v.administradorUid && ` - Admin: ${getNomeFuncionario(v.administradorUid)}`}
                                 </li>
                             ))}
                         </ul>
                     </div>
                 )}
            </div>
        </div>
    );
}

export default DetalhesCaravanaAdmin;