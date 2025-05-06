import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css';
import * as api from '../../../services/api';
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner'; // Importe o spinner

function Participantes({ caravanaId, funcionarioUid = null, cargo = null }) {
    const [distribuicao, setDistribuicao] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [secaoAberta, setSecaoAberta] = useState({});

    useEffect(() => {
        const fetchParticipantes = async () => {
            if (!caravanaId) {
                 setDistribuicao({ definicaoCompleta: false, todosParticipantes: [] });
                 setLoading(false);
                 return;
            }
            setLoading(true);
            setError(null);
            setDistribuicao(null);
            try {
                const params = {};
                if (funcionarioUid) params.funcionarioUid = funcionarioUid;
                if (cargo) params.cargo = cargo;
                const data = await api.getParticipantesDistribuidos(caravanaId, params);
                setDistribuicao(data);

                if (data.definicaoCompleta && data.veiculosComParticipantes) {
                    const initialOpenState = {};
                    data.veiculosComParticipantes.forEach((_, index) => {
                        initialOpenState[`veiculo-${index}`] = true; // Deixa aberto por padrão
                    });
                    setSecaoAberta(initialOpenState);
                }

            } catch (err) {
                setError(err.message || "Erro ao buscar participantes.");
                console.error("Erro ao buscar participantes distribuídos:", err);
                setDistribuicao({ definicaoCompleta: false, todosParticipantes: [] });
            } finally {
                setLoading(false);
            }
        };

        fetchParticipantes();
    }, [caravanaId, funcionarioUid, cargo]);

    const toggleSecao = (idSecao) => {
        setSecaoAberta(prev => ({ ...prev, [idSecao]: !prev[idSecao] }));
    };

    // Esta tabela agora mostrará a quantidade TOTAL de ingressos que o participante comprou
    const renderTabelaParticipantesGeral = (listaParticipantes) => {
        if (!listaParticipantes || listaParticipantes.length === 0) {
            return <p className={styles.semParticipantes}>Nenhum participante encontrado.</p>;
        }
        return (
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Telefone</th>
                        <th>Qtd. Ingressos (Total)</th>
                    </tr>
                </thead>
                <tbody>
                    {listaParticipantes.map((participante) =>(
                       <tr key={participante.id || participante.uid || participante.email}>
                            <td>{participante.nome || 'N/A'}</td>
                            <td>{participante.email || 'N/A'}</td>
                            <td>{participante.telefone || 'N/A'}</td>
                            <td>{participante.quantidade || 'N/A'}</td>
                       </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    // Esta tabela é para dentro de cada veículo e mostra a quantidade de "assentos" que
    // a compra daquele participante ocupa NAQUELE VEÍCULO.
    // Se uma compra de 3 ingressos foi dividida, aqui só aparecerá a parte dela no veículo.
    // Para simplificar, se a API retorna o participante com sua quantidade total, exibimos isso.
    // A lógica de "quantos desta compra estão neste veículo" é mais complexa.
    const renderTabelaParticipantesPorVeiculo = (listaParticipantesAtribuidos) => {
        if (!listaParticipantesAtribuidos || listaParticipantesAtribuidos.length === 0) {
            return <p className={styles.semParticipantes}>Nenhum participante atribuído a este veículo.</p>;
        }
        return (
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Telefone</th>
                        {/* Mostra a quantidade TOTAL da compra do participante */}
                        <th>Ingressos Comprados</th>
                    </tr>
                </thead>
                <tbody>
                    {listaParticipantesAtribuidos.map((participante) => (
                       <tr key={participante.id || participante.uid || participante.email}>
                            <td>{participante.nome || 'N/A'}</td>
                            <td>{participante.email || 'N/A'}</td>
                            <td>{participante.telefone || 'N/A'}</td>
                            <td>{participante.quantidade || 1}</td>
                       </tr>
                    ))}
                </tbody>
            </table>
        );
    };


    if (loading) return <LoadingSpinner mensagem="Carregando participantes..." />;
    if (error) return <div className={styles.container}><p className={styles.error}>Erro: {error}</p></div>;
    if (!distribuicao) return <div className={styles.container}><p>Sem dados de participantes.</p></div>;


    return (
        <div className={styles.container}>
             <h2>Participantes da Caravana</h2>

             {!distribuicao.definicaoCompleta && (
                <>
                    <p className={styles.aviso}>O transporte final ainda não foi definido ou não há participantes com transporte definido. Exibindo lista geral de compras.</p>
                    {renderTabelaParticipantesGeral(distribuicao.todosParticipantes)}
                </>
             )}

            {distribuicao.definicaoCompleta && (
                 <>
                    {distribuicao.veiculosComParticipantes.length === 0 &&
                        (funcionarioUid ? <p>Você não está atribuído a nenhum veículo nesta caravana.</p> : <p>Nenhum veículo definido ou nenhum participante atribuído aos veículos.</p>)
                    }
                    {distribuicao.veiculosComParticipantes.map((itemVeiculo, index) => {
                         const idSecao = `veiculo-${index}`;
                         const estaAberta = secaoAberta[idSecao];
                         const totalPessoasNoVeiculo = itemVeiculo.participantesAtribuidos.length + (itemVeiculo.administrador ? 1 : 0) + (itemVeiculo.motorista ? 1 : 0);

                         return (
                            <div key={idSecao} className={styles.veiculoContainer}>
                                <button className={styles.cabecalhoDropdown} onClick={() => toggleSecao(idSecao)}>
                                    <div className={styles.infoCabecalho}>
                                        <strong>Veículo {index + 1}: {itemVeiculo.veiculoInfo.nomeTipo}</strong>
                                        {itemVeiculo.veiculoInfo.placa && ` (Placa: ${itemVeiculo.veiculoInfo.placa})`}
                                        <span> | Admin: {itemVeiculo.administrador?.nome || 'N/D'}</span>
                                        <span> | Motorista: {itemVeiculo.motorista?.nome || 'N/D'}</span>
                                        <span> | Lotação: {itemVeiculo.participantesAtribuidos.length} / {itemVeiculo.veiculoInfo.assentos - (itemVeiculo.administrador ? 1:0) - (itemVeiculo.motorista ? 1:0) } clientes</span>
                                    </div>
                                    <span className={styles.setaDropdown}>{estaAberta ? '▲' : '▼'}</span>
                                </button>
                                {estaAberta && (
                                    <div className={styles.conteudoDropdown}>
                                        {renderTabelaParticipantesPorVeiculo(itemVeiculo.participantesAtribuidos)}
                                    </div>
                                )}
                            </div>
                         )
                     })}
                 </>
             )}
        </div>
    );
}

export default Participantes;