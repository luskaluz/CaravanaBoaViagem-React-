import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css';
import * as api from '../../../services/api';

function Participantes({ caravanaId }) {
    const [distribuicao, setDistribuicao] = useState(null); // Armazena a resposta da API
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchParticipantesDistribuidos = async () => {
            if (!caravanaId) {
                 setDistribuicao({ definicaoCompleta: false, todosParticipantes: [] }); // Estado inicial claro
                 setLoading(false);
                 return;
            }
            setLoading(true);
            setError(null);
            setDistribuicao(null); // Limpa dados antigos
            try {
                // Chama a nova rota do backend
                const data = await api.getParticipantesDistribuidos(caravanaId); // <<< NOVA CHAMADA API
                setDistribuicao(data);
            } catch (err) {
                setError(err.message || "Erro ao buscar participantes.");
                console.error("Erro ao buscar participantes distribuídos:", err);
                setDistribuicao({ definicaoCompleta: false, todosParticipantes: [] }); // Define um estado de erro/vazio
            } finally {
                setLoading(false);
            }
        };

        fetchParticipantesDistribuidos();
    }, [caravanaId]);

    // Função auxiliar para renderizar tabela de participantes (para reutilização)
    const renderTabelaParticipantes = (listaParticipantes) => {
        if (!listaParticipantes || listaParticipantes.length === 0) {
            return <p>Nenhum participante encontrado.</p>;
        }
        return (
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Telefone</th>
                        {/* Não mostra mais a quantidade comprada aqui, pois está distribuído */}
                    </tr>
                </thead>
                <tbody>
                    {listaParticipantes.map((participante) =>(
                       <tr key={participante.id || participante.uid || participante.email}>
                            <td>{participante.nome || 'N/A'}</td>
                            <td>{participante.email || 'N/A'}</td>
                            <td>{participante.telefone || 'N/A'}</td>
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
                    <p className={styles.aviso}>O transporte final ainda não foi definido. Exibindo lista geral.</p>
                    {renderTabelaParticipantes(distribuicao.todosParticipantes)}
                </>
             )}

            {!loading && !error && distribuicao && distribuicao.definicaoCompleta && (
                 <>
                    {distribuicao.veiculosComParticipantes.length === 0 && <p>Nenhum veículo definido para esta caravana.</p>}
                    {distribuicao.veiculosComParticipantes.map((itemVeiculo, index) => (
                        <div key={itemVeiculo.veiculoInfo.tipoId + '-' + index} className={styles.veiculoContainer}>
                            <h3>
                                Veículo {index + 1}: {itemVeiculo.veiculoInfo.nomeTipo}
                                {itemVeiculo.veiculoInfo.placa && ` (Placa: ${itemVeiculo.veiculoInfo.placa})`}
                            </h3>
                            <div className={styles.responsaveis}>
                                <span><strong>Admin:</strong> {itemVeiculo.administrador?.nome || 'Não definido'}</span>
                                <span><strong>Motorista:</strong> {itemVeiculo.motorista?.nome || 'Não definido'}</span>
                            </div>
                            {renderTabelaParticipantes(itemVeiculo.participantesAtribuidos)}
                        </div>
                    ))}
                 </>
             )}
        </div>
    );
}

export default Participantes;