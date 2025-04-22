import React, { useState, useEffect } from 'react';
import styles from './DetalhesCaravanaAdmin.module.css';
import * as api from '../../services/api';

const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/80x120?text=Foto";

function DetalhesCaravanaAdmin({ caravana, onClose }) {
    const [descricao, setDescricao] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);

    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                setIsLoadingDesc(true);
                try {
                    const localidadeData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricao(localidadeData.descricao || '');
                } catch (error) { console.error(error); setDescricao('Erro.'); }
                finally { setIsLoadingDesc(false); }
            } else { setDescricao('N/A'); }
        };
        fetchDescricao();
    }, [caravana]);

    const translateStatus = (status) => {
        switch (status) {
            case 'confirmada': return 'Confirmada';
            case 'nao_confirmada': return 'Não Confirmada';
            case 'cancelada': return 'Cancelada';
            case 'concluida': return 'Concluída';
            default: return 'Desconhecido';
        }
    };

    // --- SUBCOMPONENTE ATUALIZADO ---
    const EmployeeInfoDetailed = ({ employee, role, originalUid }) => {
        // Caso 1: Funcionário não atribuído (employee é null ou undefined)
        if (!employee) {
            return (
                 <div className={`${styles.employeeBlock} ${styles.employeeNotConfirmed}`}> {/* Classe opcional para estilizar diferente */}
                    {/* NENHUMA IMAGEM AQUI */}
                    <div className={styles.employeeDetails}>
                        <p className={styles.infoStrong}><strong>{role}:</strong> Não Confirmado</p>
                    </div>
                 </div>
            );
        }

        // Caso 2: Houve um erro ao buscar o funcionário
        if (employee.error) {
             return (
                 <div className={styles.employeeBlock}>
                    {/* Mostra placeholder no erro */}
                    <img src={PLACEHOLDER_IMAGE_URL} alt={role} className={styles.employeePhoto}/>
                    <div className={styles.employeeDetails}>
                        <p className={styles.infoStrong}><strong>{role}:</strong> Erro ao buscar</p>
                        <p className={styles.infoSmall}>UID: {employee.uid || originalUid || 'N/A'}</p>
                    </div>
                 </div>
             );
        }

        // Caso 3: Sucesso, temos dados do funcionário
        return (
            <div className={styles.employeeBlock}>
                {/* Mostra foto real ou placeholder */}
                <img
                    src={employee.fotoUrl || PLACEHOLDER_IMAGE_URL}
                    alt={employee.nome || role}
                    className={styles.employeePhoto}
                    onError={(e) => { e.target.onerror = null; e.target.src=PLACEHOLDER_IMAGE_URL }}
                />
                <div className={styles.employeeDetails}>
                    <p className={styles.infoStrong}><strong>{role}:</strong> {employee.nome || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Email:</strong> {employee.email || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Telefone:</strong> {employee.telefone || 'N/A'}</p>
                </div>
            </div>
        );
    };
    // --- FIM SUBCOMPONENTE ---

    if (!caravana) return null;

    const formatCurrency = (value) => `R$ ${(parseFloat(value) || 0).toFixed(2)}`;
    const formatPercentage = (value) => `${(parseFloat(value) || 0).toFixed(1)}%`;
    const formatRoi = (value) => (value === Infinity ? 'N/A' : formatPercentage(value));

    const vagasOcupadas = caravana.vagasOcupadas || 0;
    const ocupacaoPercentual = caravana.ocupacaoPercentual ?? (caravana.vagasTotais > 0 ? (vagasOcupadas / caravana.vagasTotais) * 100 : 0);


    return (
        <div className={styles.container}>
            <div className={styles.modalContent}>
                <h2 className={styles.title}>Detalhes da Caravana</h2>
                <div className={styles.card}>
                     {caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 && ( <img src={caravana.imagensLocalidade[0]} alt={caravana.nomeLocalidade || 'Localidade'} className={styles.cardImage}/> )}
                    <div className={styles.cardContent}>
                        <h3 className={styles.sectionTitle}>Informações Gerais</h3>
                        <p className={styles.info}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
                        <p className={styles.info}><strong>Descrição:</strong> {isLoadingDesc ? 'Carregando...' : (descricao || 'Sem descrição')}</p>
                        <p className={styles.info}><strong>Data:</strong> {caravana.data ? new Date(caravana.data).toLocaleDateString() : 'N/A'}</p>
                        <p className={styles.info}><strong>Horário de Saída:</strong> {caravana.horarioSaida || 'N/A'}</p>
                        <p className={styles.info}><strong>Status:</strong> {translateStatus(caravana.status)}</p>

                        <h3 className={styles.sectionTitle}>Equipe Responsável</h3>
                        {/* Chamadas não mudam, a lógica está no subcomponente */}
                        <EmployeeInfoDetailed employee={caravana.administrador} role="Administrador" originalUid={caravana.administradorUid} />
                        <EmployeeInfoDetailed employee={caravana.motorista} role="Motorista" originalUid={caravana.motoristaUid} />
                        <EmployeeInfoDetailed employee={caravana.guia} role="Guia" originalUid={caravana.guiaUid} />


                        <h3 className={styles.sectionTitle}>Vagas</h3>
                        <p className={styles.info}><strong>Vagas Totais:</strong> {caravana.vagasTotais || 0}</p>
                        <p className={styles.info}><strong>Vagas Disponiveis:</strong> {caravana.vagasDisponiveis ?? 'N/A'}</p>
                        <p className={styles.info}><strong>Total de Bilhetes Vendidos:</strong> {vagasOcupadas}</p>
                        <p className={styles.info}><strong>Ocupação:</strong> {formatPercentage(ocupacaoPercentual)} </p>

                        <h3 className={styles.sectionTitle}>Financeiro</h3>
                        <p className={styles.info}><strong>Preço por Ingresso:</strong> {formatCurrency(caravana.preco)}</p>
                        <p className={styles.info}><strong>Despesas:</strong> {formatCurrency(caravana.despesas)}</p>
                        <p className={styles.info}><strong>Arrecadação Atual:</strong> {formatCurrency(caravana.receitaAtual)}</p>
                        <p className={styles.info}><strong>Lucro Atual:</strong> {formatCurrency(caravana.lucroAtual)}</p>
                        <p className={styles.info}><strong>Lucro Máximo Previsto:</strong> {formatCurrency(caravana.lucroMaximo)}</p>
                        <p className={styles.info}><strong>ROI Atual:</strong> {formatRoi(caravana.roiAtual)}</p>
                        <p className={styles.info}><strong>ROI Máximo Previsto:</strong> {formatRoi(caravana.roi)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DetalhesCaravanaAdmin;