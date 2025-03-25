
// src/components/Usuario/DetalhesCaravanaUsuario.js //(Não mudou, mas incluo para ficar completo)
import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaUsuario.module.css';
import * as api from '../../services/api';

function DetalhesCaravanaUsuario({ caravana, onClose }) {
    const [descricao, setDescricao] = useState('');

    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                try {
                    const localidadeData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricao(localidadeData.descricao);
                } catch (error) {
                    console.error("Erro ao buscar descrição da localidade:", error);
                }
            }
        };
        fetchDescricao();
    }, [caravana]);

    if (!caravana) { return <div>Selecione uma caravana.</div> }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Caravana</h2>
            {caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 && (
                <img src={caravana.imagensLocalidade[0]} alt={caravana.nomeLocalidade} className={styles.image} />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade}</p>
            <p className={styles.infoItem}><strong>Data: </strong>{new Date(caravana.data).toLocaleDateString()}</p>
            <p className={styles.infoItem}><strong>Horário de Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            <p className={styles.infoItem}><strong>Ingressos Comprados:</strong> {caravana.quantidadeTotal}</p>
            <p className={styles.infoItem}>
                <strong>Status</strong>:{" "}
                {caravana.status === "confirmada"
                    ? "Confirmada"
                    : caravana.status === "nao_confirmada"
                        ? "Não Confirmada"
                        : caravana.status === "cancelada"
                            ? "Cancelada"
                            : "Desconhecido"}
            </p>
            <p className={styles.infoItem}><strong>Descrição: </strong>{descricao}</p>
            <p className={styles.infoItem}><strong>Administrador:</strong> {caravana.nomeAdministrador || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Email do Administrador:</strong> {caravana.emailAdministrador || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Telefone do Administrador:</strong> {caravana.telefoneAdministrador || 'N/A'}</p>
        </div>
    );
}

export default DetalhesCaravanaUsuario;
