import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css';
import * as api from '../../../services/api';

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
                        initialOpenState[`veiculo-${index}`] = false; // Começa fechado
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

    // Modificado para usar quantidadeAtribuida
    const renderTabelaParticipantes = (listaParticipantes) => {
        if (!listaParticipantes || listaParticipantes.length === 0) {
            // Verifica se a lista é vazia após o transporte definido
             if(distribuicao?.definicaoCompleta) {
                 return <p className={styles.semParticipantes}>Nenhum participante atribuído a este veículo.</p>;
             } else {
                 return <p className={styles.semParticipantes}>Nenhum participante encontrado.</p>;
             }
        }
        return (
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Telefone</th>
                        <th>Ingressos (neste Veículo)</th>
                    </tr>
                </thead>
                <tbody>
                    {/* Mapeia a lista que agora contém quantidadeAtribuida */}
                    {listaParticipantes.map((participante) =>(
                       <tr key={participante.id || participante.uid || participante.email}>
                            <td>{participante.nome || 'N/A'}</td>
                            <td>{participante.email || 'N/A'}</td>
                            <td>{participante.telefone || 'N/A'}</td>
                            {/* Exibe a quantidade específica deste veículo */}
                            <td>{participante.quantidadeAtribuida || 'N/A'}</td>
                       </tr>
                    ))}
                </tbody>
            </table>
        );
    };


    return (
        <div className={styles.container}>
             <h2>Participantes da Caravana</h2>

             {loading && <p className={styles.loading}>Carregando participantes...</p>}
             {error && <p className={styles.error}>Erro: {error}</p>}

             {/* Renderiza lista geral se transporte não definido */}
             {!loading && !error && distribuicao && !distribuicao.definicaoCompleta && (
                <>
                    <p className={styles.aviso}>O transporte final ainda não foi definido. Exibindo lista geral de compras.</p>
                    {/* A tabela aqui pode mostrar a quantidade total da compra original */}
                    <table className={styles.table}>
                         <thead>
                             <tr>
                                 <th>Nome</th>
                                 <th>Email</th>
                                 <th>Telefone</th>
                                 <th>Qtd. Total Comprada</th>
                             </tr>
                         </thead>
                         <tbody>
                             {distribuicao.todosParticipantes.map((p) =>(
                                <tr key={p.id || p.uid || p.email}>
                                     <td>{p.nome || 'N/A'}</td>
                                     <td>{p.email || 'N/A'}</td>
                                     <td>{p.telefone || 'N/A'}</td>
                                     <td>{p.quantidade || 'N/A'}</td>
                                </tr>
                             ))}
                         </tbody>
                     </table>
                </>
             )}

            {/* Renderiza por veículo se transporte definido */}
            {!loading && !error && distribuicao && distribuicao.definicaoCompleta && (
                 <>
                    {distribuicao.veiculosComParticipantes.length === 0 &&
                        (funcionarioUid ? <p>Você não está atribuído a nenhum veículo nesta caravana.</p> : <p>Nenhum veículo definido ou nenhum participante atribuído.</p>)
                    }
                    {distribuicao.veiculosComParticipantes.map((itemVeiculo, index) => {
                         const idSecao = `veiculo-${index}`;
                         const estaAberta = secaoAberta[idSecao];
                         return (
                            <div key={idSecao} className={styles.veiculoContainer}>
                                <button className={styles.cabecalhoDropdown} onClick={() => toggleSecao(idSecao)}>
                                    <div className={styles.infoCabecalho}>
                                        <strong>Veículo {index + 1}: {itemVeiculo.veiculoInfo.nomeTipo}</strong>
                                        {itemVeiculo.veiculoInfo.placa && ` (Placa: ${itemVeiculo.veiculoInfo.placa})`}
                                        <span> | Admin: {itemVeiculo.administrador?.nome || 'N/D'}</span>
                                        <span> | Motorista: {itemVeiculo.motorista?.nome || 'N/D'}</span>
                                        {/* Usa totalPessoasVeiculo que veio da API */}
                                        <span> | Pessoas no Veículo: {itemVeiculo.totalPessoasVeiculo || 0}</span>
                                    </div>
                                    <span className={styles.setaDropdown}>{estaAberta ? '▲' : '▼'}</span>
                                </button>
                                {estaAberta && (
                                    <div className={styles.conteudoDropdown}>
                                        {/* Passa a lista correta para a tabela */}
                                        {renderTabelaParticipantes(itemVeiculo.participantesAtribuidos)}
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
