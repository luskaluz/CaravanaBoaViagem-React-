import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css'; // Usará o mesmo estilo do modal de funcionário (ou crie um novo)
import * as api from '../../../services/api'; // Usa a API para buscar

function Participantes({ caravanaId }) { // Recebe apenas o ID
    const [participantes, setParticipantes] = useState([]);
    const [loading, setLoading] = useState(true); // Adicionado estado de loading
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchParticipantes = async () => {
            if (!caravanaId) {
                 setParticipantes([]);
                 setLoading(false);
                 return;
            }
            setLoading(true);
            setError(null);
            try {
                // Usa a mesma chamada de API que o modal do funcionário
                const data = await api.getParticipantesCaravana(caravanaId);
                setParticipantes(data || []); // Garante que seja um array
            } catch (err) {
                setError(err.message || "Erro ao buscar participantes.");
                console.error("Erro ao buscar participantes (Admin):", err);
                setParticipantes([]);
            } finally {
                setLoading(false);
            }
        };

        fetchParticipantes();
    }, [caravanaId]); // Depende do caravanaId

    return (
        // Estrutura similar ao ParticipantesModal, mas talvez sem o overlay/modalContent
        // se for usado dentro de outra estrutura de modal no admin
        <div className={styles.container}> {/* Use uma classe container apropriada */}
             {/* O título pode vir do componente pai ou ser definido aqui */}
             <h2>Participantes da Caravana</h2>

             {loading && <p className={styles.loading}>Carregando participantes...</p>}
             {error && <p className={styles.error}>Erro: {error}</p>}

             {!loading && !error && participantes.length === 0 ? (
                 <p>Nenhum participante inscrito nesta caravana.</p>
             ) : !loading && !error && (
                 // --- Usa a mesma estrutura de tabela ---
                 <table className={styles.table}>
                     <thead>
                         <tr>
                             <th>Nome</th>
                             <th>Email</th>
                             <th>Telefone</th> {/* Adicionado Telefone */}
                             <th>Ingressos</th>
                         </tr>
                     </thead>
                     <tbody>
                         {participantes.map((participante) =>(
                            // Usa participante.id ou uid como chave, se disponível
                            <tr key={participante.id || participante.uid || participante.email}>
                                 <td>{participante.nome || 'N/A'}</td>
                                 <td>{participante.email || 'N/A'}</td>
                                 <td>{participante.telefone || 'N/A'}</td> {/* Mostra Telefone */}
                                 <td>{participante.quantidade || 'N/A'}</td>
                            </tr>
                         ))}
                     </tbody>
                 </table>
             )}
        </div>
    );
}

export default Participantes;