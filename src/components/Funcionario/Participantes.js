import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css';
import * as api from '../../../services/api';
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner';

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
                        initialOpenState[`veiculo-${index}`] = index === 0;
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

    const renderTabelaParticipantes = (listaParticipantes) => {
        if (!listaParticipantes || listaParticipantes.length === 0) {
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
                        <th>Ingressos (nesta compra)</th>
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


    if (loading) return <LoadingSpinner mensagem="Carregando participantes..." />;
    if (error) return <div className={styles.container}><p className={styles.error}>Erro: {error}</p></div>;
    if (!distribuicao) return <div className={styles.container}><p>Sem dados de participantes.</p></div>;


    return (
        <div className={styles.container}>
             <h2>Participantes da Caravana</h2>

             {!distribuicao.definicaoCompleta && (
                <>
                    <p className={styles.aviso}>O transporte final ainda não foi definido ou não há participantes. Exibindo lista geral de compras.</p>
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

            {distribuicao.definicaoCompleta && (
                 <>
                    {distribuicao.veiculosComParticipantes.length === 0 &&
                        (funcionarioUid ? <p>Você não está atribuído a nenhum veículo nesta caravana, ou não há veículos definidos.</p> : <p>Nenhum veículo definido ou nenhum participante atribuído aos veículos.</p>)
                    }
                    {distribuicao.veiculosComParticipantes.map((itemVeiculo, index) => {
                         const idSecao = `veiculo-${index}`;
                         const estaAberta = secaoAberta[idSecao];
                         const totalParticipantesClientesNoVeiculo = itemVeiculo.participantesAtribuidos?.length || 0;
                         let numStaffNoVeiculo = 0;
                         if (itemVeiculo.administrador) numStaffNoVeiculo++;
                         if (itemVeiculo.motorista) numStaffNoVeiculo++;
                         const lotacaoNumeros = `${totalParticipantesClientesNoVeiculo} clientes + ${numStaffNoVeiculo} staff`;

                         return (
                            <div key={idSecao} className={styles.veiculoContainer}>
                                <button className={styles.cabecalhoDropdown} onClick={() => toggleSecao(idSecao)}>
                                    <div className={styles.infoCabecalho}>
                                        <strong>Veículo {index + 1}: {itemVeiculo.veiculoInfo.nomeTipo}</strong>
                                        {itemVeiculo.veiculoInfo.placa && ` (Placa: ${itemVeiculo.veiculoInfo.placa})`}
                                        <span> | Admin: {itemVeiculo.administrador?.nome || 'N/D'}</span>
                                        <span> | Motorista: {itemVeiculo.motorista?.nome || 'N/D'}</span>
                                        <span> | Lotação: {lotacaoNumeros} / {itemVeiculo.veiculoInfo.assentos}</span>
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