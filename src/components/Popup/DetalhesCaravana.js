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

    const EmployeeInfoDetailed = ({ employee, role }) => {
        if (!employee || employee.error) {
             const uidWithError = employee?.uid || (role === 'Administrador' ? caravana?.administradorUid : role === 'Motorista' ? caravana?.motoristaUid : caravana?.guiaUid);
             let errorMessage = `Não atribuído${uidWithError ? ` (UID: ${uidWithError})` : ''}`;
             if (employee?.error) errorMessage = `Erro ao buscar (${uidWithError})`;
            return ( <div className={styles.employeeBlock}><img src={PLACEHOLDER_IMAGE_URL} alt={role} className={styles.employeePhoto}/><div className={styles.employeeDetails}><p className={styles.info}><strong>{role}:</strong> {errorMessage}</p></div></div> );
        }
        return (
            <div className={styles.employeeBlock}>
                <img src={employee.fotoUrl || PLACEHOLDER_IMAGE_URL} alt={employee.nome || role} className={styles.employeePhoto} onError={(e) => { e.target.onerror = null; e.target.src=PLACEHOLDER_IMAGE_URL }}/>
                <div className={styles.employeeDetails}>
                    <p className={styles.infoStrong}><strong>{role}:</strong> {employee.nome || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Email:</strong> {employee.email || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Telefone:</strong> {employee.telefone || 'N/A'}</p>
                </div>
            </div>
        );
    };

    if (!caravana) return null;

    // --- REMOVIDOS CÁLCULOS LOCAIS DE MÉTRICAS ---
    // Usaremos diretamente caravana.vagasOcupadas, caravana.lucroAtual, etc. vindo da API

    // Usamos fallback para 0 ANTES de chamar toFixed para evitar erros
    const formatCurrency = (value) => `R$ ${(value || 0).toFixed(2)}`;
    const formatPercentage = (value) => `${(value || 0).toFixed(1)}%`;
    const formatRoi = (value) => (value === Infinity ? 'N/A' : formatPercentage(value));


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
                        <EmployeeInfoDetailed employee={caravana.administrador} role="Administrador" />
                        <EmployeeInfoDetailed employee={caravana.motorista} role="Motorista" />
                        {caravana.guia && <EmployeeInfoDetailed employee={caravana.guia} role="Guia" />}
                        {!caravana.guia && !caravana.guiaUid && <p className={styles.info}><strong>Guia:</strong> Nenhum</p> }

                        <h3 className={styles.sectionTitle}>Vagas</h3>
                        <p className={styles.info}><strong>Vagas Totais:</strong> {caravana.vagasTotais || 0}</p>
                        <p className={styles.info}><strong>Vagas Disponiveis:</strong> {caravana.vagasDisponiveis ?? 'N/A'}</p>
                        <p className={styles.info}><strong>Total de Bilhetes Vendidos:</strong> {caravana.vagasOcupadas || 0}</p> {/* Usa direto da API */}
                        <p className={styles.info}><strong>Ocupação:</strong> {formatPercentage((caravana.vagasTotais > 0 ? ((caravana.vagasOcupadas || 0) / caravana.vagasTotais) * 100 : 0))} </p> {/* Calcula ocupação se não vier */}

                        <h3 className={styles.sectionTitle}>Financeiro</h3>
                        <p className={styles.info}><strong>Preço por Ingresso:</strong> {formatCurrency(caravana.preco)}</p>
                        <p className={styles.info}><strong>Despesas:</strong> {formatCurrency(caravana.despesas)}</p>
                        <p className={styles.info}><strong>Arrecadação Atual:</strong> {formatCurrency(caravana.receitaAtual)}</p> {/* Usa direto da API */}
                        <p className={styles.info}><strong>Lucro Atual:</strong> {formatCurrency(caravana.lucroAtual)}</p> {/* Usa direto da API */}
                        <p className={styles.info}><strong>Lucro Máximo Previsto:</strong> {formatCurrency(caravana.lucroMaximo)}</p> {/* Usa direto da API */}
                        <p className={styles.info}><strong>ROI Atual:</strong> {formatRoi(caravana.roiAtual)}</p> {/* Usa direto da API */}
                        <p className={styles.info}><strong>ROI Máximo Previsto:</strong> {formatRoi(caravana.roi)}</p> {/* Usa direto da API (roi é o máximo) */}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DetalhesCaravanaAdmin;