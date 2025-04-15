
import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css';
import * as api from '../../../services/api';

function Participantes({ caravanaId }) { 
    const [participantes, setParticipantes] = useState([]); 
    const [loading, setLoading] = useState(true); 
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
                const data = await api.getParticipantesCaravana(caravanaId);
                setParticipantes(data || []); 
            } catch (err) {
                setError(err.message || "Erro ao buscar participantes."); 
                console.error("Erro ao buscar participantes:", err);
                setParticipantes([]); 
            } finally {
                setLoading(false); 
            }
        };

        fetchParticipantes();
    }, [caravanaId]);

    if (error) {
        return <div className={styles.error}>Erro: {error}</div>;
    }

    if (!participantes || participantes.length === 0) {
        return <p>Nenhum participante registrado nesta caravana.</p>;
    }

    return (
        <div className={styles.container}>
            <h3>Participantes</h3>
            <ul className={styles.lista}>
                {participantes.map((participante) => (
                    <li key={participante.uid || participante.id} className={styles.item}> 
                        <p>
                            <strong>Nome:</strong> {participante.nome || 'N/A'}
                        </p>
                        <p>
                            <strong>Email:</strong> {participante.email}
                        </p>
                        <p>
                            <strong>Telefone:</strong> {participante.telefone || 'N/A'}
                        </p>
                        <p>
                            <strong>Ingressos:</strong> {participante.quantidade}
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default Participantes;