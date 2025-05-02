import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css';
import * as api from '../../../services/api';

// Recebe funcionarioUid e cargo como props opcionais
function Participantes({ caravanaId, funcionarioUid = null, cargo = null }) {
    const [distribuicao, setDistribuicao] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [secaoAberta, setSecaoAberta] = useState({}); // Estado para controlar dropdowns

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
                // Passa funcionarioUid e cargo para a API se existirem
                const params = {};
                if (funcionarioUid) params.funcionarioUid = funcionarioUid;
                if (cargo) params.cargo = cargo;

                // Assume que api.getParticipantesDistribuidos foi atualizado para aceitar query params
                // Se não, a lógica de filtragem precisaria ser feita aqui no frontend após buscar tudo
                const data = await api.getParticipantesDistribuidos(caravanaId, params); // <<< CHAMADA API ATUALIZADA
                setDistribuicao(data);

                // Inicializa o estado das seções abertas (todas fechadas por padrão)
                if (data.definicaoCompleta && data.veiculosComParticipantes) {
                    const initialOpenState = {};
                    data.veiculosComParticipantes.forEach((_, index) => {
                        initialOpenState[`veiculo-${index}`] = false;
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
    }, [caravanaId, funcionarioUid, cargo]); // Re-busca se o funcionário mudar (improvável neste contexto, mas correto)

    const toggleSecao = (idSecao) => {
        setSecaoAberta(prev => ({ ...prev, [idSecao]: !prev[idSecao] }));
    };

    const renderTabelaParticipantes = (listaParticipantes) => {
        if (!listaParticipantes || listaParticipantes.length === 0) {
            return <p className={styles.semParticipantes}>Nenhum participante neste veículo.</p>;
        }
        return (
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Telefone</th>
                        <th>Qtd. Comprada</th>
                    </tr>
                </thead>
                <tbody>
                    {listaParticipantes.map((participante) =>(
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


    return (
        <div className={styles.container}>
             <h2>Participantes da Caravana</h2>

             {loading && <p className={styles.loading}>Carregando participantes...</p>}
             {error && <p className={styles.error}>Erro: {error}</p>}

             {!loading && !error && distribuicao && !distribuicao.definicaoCompleta && (
                <>
                    <p className={styles.aviso}>O transporte final ainda não foi definido ou não há participantes. Exibindo lista geral.</p>
                    {renderTabelaParticipantes(distribuicao.todosParticipantes)}
                </>
             )}

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
                                        <span> | Participantes: {itemVeiculo.participantesAtribuidos.length}</span>
                                    </div>
                                    <span className={styles.setaDropdown}>{estaAberta ? '▲' : '▼'}</span>
                                </button>
                                {estaAberta && (
                                    <div className={styles.conteudoDropdown}>
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