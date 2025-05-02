import React, { useState, useEffect, useMemo } from 'react'; // <<< useMemo ADICIONADO AQUI
import * as api from '../../services/api';
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

    const detalhesPessoal = useMemo(() => {
        const resultado = {
            admins: new Map(),
            motoristas: new Map(),
            guiaNome: getNomeFuncionario(caravana.guiaUid)
        };

        if (caravana.transportesFinalizados && Array.isArray(caravana.transportesFinalizados)) {
            caravana.transportesFinalizados.forEach(transporte => {
                if (transporte.administradorUid && !resultado.admins.has(transporte.administradorUid)) {
                     resultado.admins.set(transporte.administradorUid, { uid: transporte.administradorUid, nome: getNomeFuncionario(transporte.administradorUid)});
                }
                if (transporte.motoristaUid && !resultado.motoristas.has(transporte.motoristaUid)) {
                    resultado.motoristas.set(transporte.motoristaUid, { uid: transporte.motoristaUid, nome: getNomeFuncionario(transporte.motoristaUid)});
                }
            });
        } else if (caravana.administradorUid) {
              if (!resultado.admins.has(caravana.administradorUid)) {
                 resultado.admins.set(caravana.administradorUid, { uid: caravana.administradorUid, nome: getNomeFuncionario(caravana.administradorUid)});
              }
        }
         if (caravana.motoristaUid && !caravana.transportesFinalizados) {
             if (!resultado.motoristas.has(caravana.motoristaUid)) {
                 resultado.motoristas.set(caravana.motoristaUid, { uid: caravana.motoristaUid, nome: getNomeFuncionario(caravana.motoristaUid)});
             }
         }

        return resultado;
    }, [caravana, funcionarios, loadingFuncionarios, getNomeFuncionario]); // getNomeFuncionario adicionado como dependencia

    const formatarData = (dataString) => {
        if (!dataString) return 'N/A';
        // Usar Z para indicar UTC se a data do backend for salva sem timezone explícito
        // mas representa uma data específica (como data de viagem)
        return new Date(dataString + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    const capacidadeExibida = caravana.transporteDefinidoManualmente
                             ? caravana.capacidadeFinalizada
                             : caravana.capacidadeCalculada;

    // Calcula vagas disponíveis para clientes baseado na capacidade atual E nos admins únicos definidos
    const vagasClientesDisponiveis = Math.max(0, (capacidadeExibida || 0) - (caravana.vagasOcupadas || 0) - detalhesPessoal.admins.size);

    return (
        <div className={styles.detalhesContainer}>
            <h2>Detalhes da Caravana: {caravana.nomeLocalidade}</h2>

            <div className={styles.gridDetalhes}>
                <div className={styles.detalheItem}><span className={styles.label}>Status:</span> {translateStatus(caravana.status)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Data Viagem:</span> {formatarData(caravana.data)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Horário Saída:</span> {caravana.horarioSaida || 'A definir'}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Data Conf. Transporte:</span> {formatarData(caravana.dataConfirmacaoTransporte)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Data Limite Vendas:</span> {formatarData(caravana.dataFechamentoVendas)}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Ocupação Mínima:</span> {caravana.ocupacaoMinima}</div>
                <div className={styles.detalheItem}><span className={styles.label}>Vagas Ocupadas (Clientes):</span> {caravana.vagasOcupadas || 0}</div>
                <div className={styles.detalheItem}>
                    <span className={styles.label}>Capacidade {caravana.transporteDefinidoManualmente ? 'Final:' : 'Calculada:'}</span>
                    {capacidadeExibida || 'Não calculada'}
                </div>
                 <div className={styles.detalheItem}>
                    <span className={styles.label}>Vagas Disp. (Clientes):</span>
                    {capacidadeExibida ? vagasClientesDisponiveis : 'N/A'}
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
                        {loadingFuncionarios ? (
                            <p>Carregando...</p>
                        ) : detalhesPessoal.admins.size > 0 ? (
                            <ul>{Array.from(detalhesPessoal.admins.values()).map(a => <li key={a.uid}>{a.nome}</li>)}</ul>
                        ) : ( <p>Nenhum administrador definido nos veículos.</p> )}
                    </div>

                     <div>
                        <span className={styles.label}>Motorista(s):</span>
                        {loadingFuncionarios ? (
                            <p>Carregando...</p>
                        ) : detalhesPessoal.motoristas.size > 0 ? (
                            <ul>{Array.from(detalhesPessoal.motoristas.values()).map(m => <li key={m.uid}>{m.nome}</li>)}</ul>
                        ) : ( <p>Nenhum motorista definido nos veículos.</p> )}
                    </div>
                </div>

                 {caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0 && (
                     <div className={styles.secaoVeiculos}>
                         <h3>Veículos Definidos</h3>
                         {loadingFuncionarios && <p>Carregando detalhes dos responsáveis...</p>}
                         <ul>
                             {caravana.transportesFinalizados.map((v, index) => (
                                 <li key={index}>
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