// src/components/Admin/DetalhesCaravana.js

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; 
import * as api from '../../services/api';
import styles from './DetalhesCaravana.module.css';

function DetalhesCaravana() {
    const { id } = useParams(); 
    const [caravana, setCaravana] = useState(null);
    const [error, setError] = useState(null);
     const navigate = useNavigate(); 

    useEffect(() => {
        const fetchCaravana = async () => {
            try {
                const data = await api.getCaravanById(id);
                setCaravana(data);
            } catch (err) {
                setError(err.message);
                console.error("Erro ao buscar detalhes da caravana:", err);
                 if (err.message.includes('404')) {  
                    navigate('/admin/caravanas');
                }
            } 
        };

        fetchCaravana();
    }, [id, navigate]);



    

    const translateStatus = (status) => {
        switch (status) {
            case 'confirmada':
                return 'Confirmada';
            case 'nao_confirmada':
                return 'Não Confirmada';
            case 'cancelada':
                return 'Cancelada';
            default:
                return 'Status Desconhecido';
        }
    };

    if (!caravana) {
        return <div className={styles.error}>Caravana não encontrada.</div>;
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Caravana</h2>

            <div className={styles.card}>


                {caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 && (
                    <img
                      src={caravana.imagensLocalidade[0]}
                      alt={`Imagem de ${caravana.nomeLocalidade}`}
                      className={styles.cardImage}
                    />
                )}

              <div className={styles.cardContent}>

                <p className={styles.info}><strong>Localidade:</strong> {caravana.nomeLocalidade}</p>
                <p className={styles.info}><strong>Data:</strong> {new Date(caravana.data).toLocaleDateString()}</p>
                <p className={styles.info}><strong>Horário de Saída:</strong> {caravana.horarioSaida || "Não definido"}</p>
                <p className={styles.info}><strong>Administrador:</strong> {caravana.nomeFuncionario || "N/A"}</p>
                <p className={styles.info}><strong>Vagas Totais:</strong> {caravana.vagasTotais}</p>
                <p className={styles.info}><strong>Vagas Disponíveis:</strong> {caravana.vagasDisponiveis}</p>
                <p className={styles.info}><strong>Preço por Ingresso:</strong> R$ {caravana.preco.toFixed(2)}</p>
                <p className={styles.info}><strong>Despesas:</strong> R$ {caravana.despesas.toFixed(2)}</p>
               <p className={styles.info}>
                   <strong>Status:</strong> {translateStatus(caravana.status)}
                  </p>

                {caravana.status === 'confirmada' && (
                  <>
                    <p className={styles.info}><strong>Lucro:</strong> R$ {caravana.lucroAbsoluto.toFixed(2)}</p>
                    <p className={styles.info}><strong>ROI:</strong> {caravana.roi.toFixed(2)}%</p>
                 </>
                )}
                <p className={styles.info}><strong>Lucro Máximo:</strong> R$ {caravana.lucroMaximo.toFixed(2)}</p>

               </div>
            </div>
        </div>
    );
}

export default DetalhesCaravana;
