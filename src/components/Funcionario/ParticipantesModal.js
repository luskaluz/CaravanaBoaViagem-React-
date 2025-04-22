// src/components/Funcionario/ParticipantesModal.js



import React, { useState, useEffect } from 'react';
import * as api from '../../services/api'; 
import styles from './ParticipantesModal.module.css';

function ParticipantesModal({ caravanaId, onClose }) {
    const [participantes, setParticipantes] = useState([]);

    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchParticipantes = async () => {

            try {
                const data = await api.getParticipantesCaravana(caravanaId);
                setParticipantes(data);
            } catch (err) {
                setError(err.message);
            } 
        };

        fetchParticipantes();
    }, [caravanaId]); 

    return (

         <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <button onClick={onClose} className={styles.closeButton}>
                    X
                </button>
                <h2>Participantes da Caravana</h2>
                
                { participantes.length === 0 ? (
                    <p>Nenhum participante inscrito nesta caravana.</p>
                ) : (

                   <table className={styles.table}>
                      <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Email</th>
                                <th>Quantidade</th>

                            </tr>
                      </thead>

                    <tbody>
                        {participantes.map((participante) =>(
                            
                           <tr key={participante.id}>
                            <td>{participante.nome}</td>
                            <td>{participante.email}</td>
                            <td>{participante.quantidade}</td>
                           </tr>
                        ))}
                    </tbody>
                  </table>
                )}
            </div>
        </div>
    )
}
export default ParticipantesModal;
