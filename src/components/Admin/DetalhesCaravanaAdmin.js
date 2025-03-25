// src/components/Admin/DetalhesCaravanaAdmin.js
import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaAdmin.module.css';
import * as api from '../../services/api';

function DetalhesCaravanaAdmin({ caravana, onClose }) {
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
        return null;
    }

    const vagasOcupadas = caravana.vagasTotais - caravana.vagasDisponiveis;
    const arrecadacaoAtual = vagasOcupadas * caravana.preco;
    const lucroAtual = arrecadacaoAtual - caravana.despesas;
     const lucroMaximo = caravana.vagasTotais * caravana.preco - caravana.despesas;
    const ocupacao = caravana.vagasTotais > 0 ? (vagasOcupadas / caravana.vagasTotais) * 100 : 0;

    // Cálculo do ROI
    const roiAtual = caravana.despesas > 0 ? (lucroAtual / caravana.despesas) * 100 : 0;
    const roiMaximo = caravana.despesas > 0 ? (lucroMaximo / caravana.despesas) * 100 : 0;


    return (
        <div className={styles.container}>
            <div className={styles.modalContent}>

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
                        <h3 className={styles.sectionTitle}>Informações Gerais</h3>
                        <p className={styles.info}>
                            <strong>Localidade:</strong> {caravana.nomeLocalidade}
                        </p>
                        <p className={styles.info}>
                            <strong>Descrição:</strong> {descricao}
                        </p>
                        <p className={styles.info}>
                            <strong>Data:</strong> {new Date(caravana.data).toLocaleDateString()}
                        </p>
                        <p className={styles.info}>
                            <strong>Horário de Saída:</strong> {caravana.horarioSaida || 'N/A'}
                        </p>
                        <p className={styles.info}>
                            <strong>Administrador:</strong> {caravana.nomeAdministrador || 'N/A'}
                        </p>
                        <p className={styles.info}>
                            <strong>Telefone do Administrador:</strong> {caravana.telefoneAdministrador || 'N/A'}
                        </p>
                        <p className={styles.info}>
                            <strong>Email do Administrador:</strong> {caravana.emailAdministrador || 'N/A'}
                        </p>
                        <p className={styles.info}>
                            <strong>Status:</strong> {translateStatus(caravana.status)}
                        </p>

                        <h3 className={styles.sectionTitle}>Vagas</h3>
                        <p className={styles.info}>
                            <strong>Vagas Totais:</strong> {caravana.vagasTotais}
                        </p>
                        <p className={styles.info}>
                            <strong>Vagas Disponiveis:</strong> {caravana.vagasDisponiveis}
                        </p>

						 <p className={styles.info}>
                            <strong>Total de Bilhetes Vendidos:</strong> {vagasOcupadas}
                        </p>

                        <p className={styles.info}>
                            <strong>Ocupação:</strong> {ocupacao.toFixed(2)}%
                        </p>
                        <h3 className={styles.sectionTitle}>Financeiro</h3>
                        <p className={styles.info}>
                            <strong>Preço por Ingresso:</strong> R$ {caravana.preco?.toFixed(2) || '0.00'}
                        </p>
                        <p className={styles.info}>
                            <strong>Despesas:</strong> R$ {caravana.despesas?.toFixed(2) || '0.00'}
                        </p>
                         <p className={styles.info}>
                            <strong>Lucro Atual:</strong> R$ {lucroAtual.toFixed(2)}
                        </p>
                         <p className={styles.info}>
                            <strong>Lucro Máximo:</strong> R$ {lucroMaximo.toFixed(2)}
                        </p>
                        <p className={styles.info}>
                            <strong>ROI Atual:</strong> {roiAtual.toFixed(2)}%
                        </p>
                        <p className={styles.info}>
                            <strong>ROI Máximo:</strong> {roiMaximo.toFixed(2)}%
                        </p>

                    </div>
                </div>
            </div>
        </div>
    );
}

export default DetalhesCaravanaAdmin;
