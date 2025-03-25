// src/components/Admin/Participantes.js
import React, { useState, useEffect } from 'react';
import styles from './Participantes.module.css';
import { db } from '../../../services/firebase'; 
import { doc, getDoc } from 'firebase/firestore';

function Participantes({ caravanaId, participantes }) {
    const [usuariosData, setUsuariosData] = useState({}); 

    const [error, setError] = useState(null); 

    useEffect(() => {
        const fetchUsuariosData = async () => {

            setError(null); 

            const newData = {}; 

            try {
                for (const participante of participantes) {
                    if (!newData[participante.usuarioId]) {
                        const userDocRef = doc(db, "users", participante.usuarioId);
                        const userDocSnap = await getDoc(userDocRef);

                        if (userDocSnap.exists()) {
                            newData[participante.usuarioId] = userDocSnap.data();
                        } else {
                            newData[participante.usuarioId] = { nome: "N/A", telefone: "N/A" };
                        }
                    }
                }
                setUsuariosData(newData); 
            } catch (err) {
                setError(err); 
                console.error("Erro ao buscar dados dos usuários:", err);
            } 
        };

        if (participantes && participantes.length > 0) { fetchUsuariosData();} 

    }, [participantes]);

    if (!participantes || participantes.length === 0) {
        return <p>Nenhum participante registrado nesta caravana.</p>;
    }

    return (
        <div className={styles.container}>
            <h3>Participantes:</h3>
            <ul className={styles.lista}>
                {participantes.map((participante) => {
                    const userData = usuariosData[participante.usuarioId] || {};
                    return (
                        <li key={participante.usuarioId} className={styles.item}>
                            <p>
                                <strong>Nome:</strong> {userData.nome || 'N/A'}
                            </p>
                            <p>
                                <strong>Email:</strong> {participante.usuarioEmail}
                            </p>
                            <p>
                                <strong>Telefone:</strong> {userData.telefone || 'N/A'}
                            </p>
                            <p>
                                <strong>Ingressos Comprados:</strong> {participante.quantidade}
                            </p>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default Participantes;
